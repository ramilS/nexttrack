import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
  E2eContext,
} from './support/create-e2e-app';

function tiptapDoc(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function tiptapWithMention(text: string, userId: string, userName: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${text} ` },
          {
            type: 'mention',
            attrs: { id: userId, label: userName },
          },
        ],
      },
    ],
  };
}

describe('Mentions in Comments Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  let memberId: string;
  let issueId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    // Create admin
    const adminHash = await bcrypt.hash('adminpass1', 4);
    const admin = await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin',
        passwordHash: adminHash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    const adminLogin = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(adminLogin.headers["set-cookie"]);

    // Create project
    await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'TEST', name: 'Test Project' })
      .expect(201);

    // Create member
    const memberHash = await bcrypt.hash('Memberpass1!', 4);
    const member = await ctx.prisma.user.create({
      data: {
        email: 'member@test.local',
        name: 'Member',
        passwordHash: memberHash,
        hasPassword: true,
        role: 'USER',
      },
    });
    memberId = member.id;

    const projDb = await ctx.prisma.project.findFirst({ where: { key: 'TEST' } });
    await ctx.prisma.projectMember.create({
      data: {
        userId: memberId,
        projectId: projDb!.id,
        roleId: '00000000-0000-0000-0000-000000000002',
      },
    });

    // Set notification preferences for member
    await ctx.prisma.notificationPreferences.create({
      data: {
        userId: memberId,
        channelSettings: {
          MENTION: { inApp: true, email: false },
        } as Prisma.InputJsonValue,
      },
    });

    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'member@test.local', password: 'Memberpass1!' })
      .expect(200);

    // Create issue
    const issueRes = await request(ctx.app.getHttpServer())
      .post('/projects/TEST/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Issue', type: 'TASK', priority: 'MEDIUM' })
      .expect(201);
    issueId = issueRes.body.data.id;
  });

  function authReq(token: string) {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
    };
  }

  async function waitForNotification(
    userId: string,
    maxWaitMs = 3_000,
  ): Promise<Awaited<ReturnType<typeof ctx.prisma.notification.findFirst>>> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const notification = await ctx.prisma.notification.findFirst({
        where: { userId: userId },
        orderBy: { createdAt: 'desc' },
      });
      if (notification) return notification;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  it('should create MENTION notification when comment contains @mention', async () => {
    // Admin creates a comment mentioning member
    await authReq(adminToken)
      .post(`/issues/${issueId}/comments`)
      .send({ body: tiptapWithMention('Hey check this', memberId, 'Member') })
      .expect(201);

    // Wait for async notification dispatch
    const notification = await waitForNotification(memberId);
    expect(notification).not.toBeNull();
    expect(notification!.type).toBe('MENTION');
  });

  it('should add mentioned user as watcher when mentioned in comment', async () => {
    // Admin creates comment with mention
    await authReq(adminToken)
      .post(`/issues/${issueId}/comments`)
      .send({ body: tiptapWithMention('FYI', memberId, 'Member') })
      .expect(201);

    // Wait for async operations
    await new Promise((r) => setTimeout(r, 500));

    // Check member is now a watcher
    const watcher = await ctx.prisma.issueWatcher.findFirst({
      where: { issueId, userId: memberId },
    });
    expect(watcher).not.toBeNull();
  });

  it('should not create notification for self-mention in comment', async () => {
    // Admin mentions themselves
    await authReq(adminToken)
      .post(`/issues/${issueId}/comments`)
      .send({ body: tiptapWithMention('Note to self', adminId, 'Admin') })
      .expect(201);

    await new Promise((r) => setTimeout(r, 1_000));

    // No notification should be created for admin
    const notification = await ctx.prisma.notification.findFirst({
      where: { userId: adminId, type: 'MENTION' },
    });
    expect(notification).toBeNull();
  });

  it('should create comment without mention (no notification)', async () => {
    await authReq(adminToken)
      .post(`/issues/${issueId}/comments`)
      .send({ body: tiptapDoc('Just a regular comment') })
      .expect(201);

    await new Promise((r) => setTimeout(r, 500));

    // No MENTION notification
    const notification = await ctx.prisma.notification.findFirst({
      where: { userId: memberId, type: 'MENTION' },
    });
    expect(notification).toBeNull();
  });

  it('should handle multiple mentions in one comment', async () => {
    // Create a third user
    const hash = await bcrypt.hash('Third1pass!', 4);
    const third = await ctx.prisma.user.create({
      data: {
        email: 'third@test.local',
        name: 'Third',
        passwordHash: hash,
        hasPassword: true,
        role: 'USER',
      },
    });
    const projDb = await ctx.prisma.project.findFirst({ where: { key: 'TEST' } });
    await ctx.prisma.projectMember.create({
      data: { userId: third.id, projectId: projDb!.id, roleId: '00000000-0000-0000-0000-000000000002' },
    });
    await ctx.prisma.notificationPreferences.create({
      data: {
        userId: third.id,
        channelSettings: {
          MENTION: { inApp: true, email: false },
        } as Prisma.InputJsonValue,
      },
    });

    // Comment with two mentions
    const body = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hey ' },
          { type: 'mention', attrs: { id: memberId, label: 'Member' } },
          { type: 'text', text: ' and ' },
          { type: 'mention', attrs: { id: third.id, label: 'Third' } },
        ],
      }],
    };

    await authReq(adminToken)
      .post(`/issues/${issueId}/comments`)
      .send({ body })
      .expect(201);

    // Both should get notifications
    const memberNotif = await waitForNotification(memberId);
    const thirdNotif = await waitForNotification(third.id);
    expect(memberNotif).not.toBeNull();
    expect(thirdNotif).not.toBeNull();
  });
});
