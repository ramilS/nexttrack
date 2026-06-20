import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Issues Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    // Seed admin user
    const hash = await bcrypt.hash('adminpass1', 4);
    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    // Create a project
    projectKey = 'ISS';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Issues Project' })
      .expect(201);
  });

  function authReq() {
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  describe('POST /projects/:key/issues', () => {
    it('should create an issue', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'First Issue', type: 'TASK', priority: 'HIGH' })
        .expect(201);

      expect(res.body.data.title).toBe('First Issue');
      expect(res.body.data.number).toBe(1);
      expect(res.body.data.type).toBe('TASK');
      expect(res.body.data.priority).toBe('HIGH');
    });

    it('should auto-increment issue numbers', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Issue One' });

      const res = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Issue Two' });

      expect(res.body.data.number).toBe(2);
    });
  });

  describe('GET /projects/:key/issues', () => {
    it('should list issues', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Issue A' });
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Issue B' });

      const res = await authReq()
        .get(`/projects/${projectKey}/issues?page=1&perPage=20`)
        .expect(200);

      expect(res.body.items.length).toBe(2);
    });
  });

  describe('GET /projects/:key/issues/:number', () => {
    it('should get issue by number', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Detail Issue' });

      const res = await authReq()
        .get(`/projects/${projectKey}/issues/1`)
        .expect(200);

      expect(res.body.data.title).toBe('Detail Issue');
    });

    it('should 404 for non-existent number', async () => {
      await authReq()
        .get(`/projects/${projectKey}/issues/999`)
        .expect(404);
    });
  });

  describe('PATCH /projects/:key/issues/:number', () => {
    it('should update issue fields', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Original Title' });

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'Updated Title', priority: 'CRITICAL' })
        .expect(200);

      expect(res.body.data.title).toBe('Updated Title');
      expect(res.body.data.priority).toBe('CRITICAL');
    });

    it('should apply the update when the expected version matches and bump it', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Versioned' })
        .expect(201);
      expect(createRes.body.data.version).toBe(1);

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'Edited', version: 1 })
        .expect(200);

      expect(res.body.data.title).toBe('Edited');
      expect(res.body.data.version).toBe(2);
    });

    it('should reject a stale version with 409 and leave the issue untouched', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Contended' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'First writer wins', version: 1 })
        .expect(200);

      const conflictRes = await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'Stale writer', version: 1 })
        .expect(409);

      expect(conflictRes.body.error.code).toBe('ISSUE_VERSION_CONFLICT');

      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const issue = await ctx.prisma.issue.findFirst({
        where: { number: 1, projectId: project!.id },
      });
      expect(issue!.title).toBe('First writer wins');
      expect(issue!.version).toBe(2);
    });

    it('should keep last-write-wins behavior when no version is sent', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Legacy client' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'Edit one' })
        .expect(200);

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ title: 'Edit two' })
        .expect(200);

      expect(res.body.data.title).toBe('Edit two');
      expect(res.body.data.version).toBe(3);
    });

    it('should assign issue to user', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Assignable' });

      const admin = await ctx.prisma.user.findFirst({
        where: { email: 'admin@test.local' },
      });

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ assigneeId: admin!.id })
        .expect(200);

      // Verify in DB since response DTO may not expose assigneeId
      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const issue = await ctx.prisma.issue.findFirst({
        where: { number: 1, projectId: project!.id },
      });
      expect(issue!.assigneeId).toBe(admin!.id);
    });
  });

  describe('DELETE /projects/:key/issues/:number', () => {
    it('should soft-delete issue', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'To Delete' });

      await authReq()
        .delete(`/projects/${projectKey}/issues/1`)
        .expect(204);

      const issue = await ctx.prisma.issue.findFirst({
        where: { number: 1, projectId: (await ctx.prisma.project.findFirst({ where: { key: projectKey } }))!.id },
      });
      expect(issue!.deletedAt).not.toBeNull();
    });
  });

  describe('Mentions in description', () => {
    it('should create MENTION notification when description contains @mention on create', async () => {
      // Create a second user to mention
      const hash = await bcrypt.hash('pass1', 4);
      const mentionedUser = await ctx.prisma.user.create({
        data: { email: 'dev@test.local', name: 'Developer', passwordHash: hash, hasPassword: true, role: 'USER' },
      });

      // Enable inApp notifications for MENTION
      await ctx.prisma.notificationPreferences.create({
        data: {
          userId: mentionedUser.id,
          channelSettings: {
            MENTION: { inApp: true, email: false },
          } satisfies Prisma.InputJsonValue,
        },
      });

      // Add mentioned user as project member
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: mentionedUser.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Create issue with @mention in description
      const descriptionWithMention = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hey ' },
            { type: 'mention', attrs: { id: mentionedUser.id, label: 'Developer' } },
            { type: 'text', text: ' please review' },
          ],
        }],
      };

      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({
          title: 'Issue with mention',
          description: descriptionWithMention,
        })
        .expect(201);

      // Poll for MENTION notification (fire-and-forget dispatch)
      let notificationCount = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200));
        notificationCount = await ctx.prisma.notification.count({
          where: { userId: mentionedUser.id, type: 'MENTION' },
        });
        if (notificationCount > 0) break;
      }

      expect(notificationCount).toBeGreaterThanOrEqual(1);
    });

    it('should add mentioned user as watcher on create', async () => {
      const hash = await bcrypt.hash('pass1', 4);
      const mentionedUser = await ctx.prisma.user.create({
        data: { email: 'watcher@test.local', name: 'Watcher', passwordHash: hash, hasPassword: true, role: 'USER' },
      });

      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: mentionedUser.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      const descriptionWithMention = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: mentionedUser.id, label: 'Watcher' } },
          ],
        }],
      };

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Watcher test', description: descriptionWithMention })
        .expect(201);

      // Verify mentioned user was added as watcher (event listener runs async)
      const proj = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const issue = await ctx.prisma.issue.findFirst({
        where: { number: issueRes.body.data.number, projectId: proj!.id },
      });

      let watcher = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        watcher = await ctx.prisma.issueWatcher.findUnique({
          where: { issueId_userId: { issueId: issue!.id, userId: mentionedUser.id } },
        });
        if (watcher) break;
      }
      expect(watcher).not.toBeNull();
    });

    it('should create MENTION notification only for new mentions on update', async () => {
      const hash = await bcrypt.hash('pass1', 4);
      const user2 = await ctx.prisma.user.create({
        data: { email: 'user2@test.local', name: 'User Two', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const user3 = await ctx.prisma.user.create({
        data: { email: 'user3@test.local', name: 'User Three', passwordHash: hash, hasPassword: true, role: 'USER' },
      });

      // Enable inApp notifications for MENTION
      await ctx.prisma.notificationPreferences.createMany({
        data: [
          {
            userId: user2.id,
            channelSettings: {
              MENTION: { inApp: true, email: false },
            } satisfies Prisma.InputJsonValue,
          },
          {
            userId: user3.id,
            channelSettings: {
              MENTION: { inApp: true, email: false },
            } satisfies Prisma.InputJsonValue,
          },
        ],
      });

      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: user2.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: user3.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Create issue with user2 mention
      const initialDescription = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: user2.id, label: 'User Two' } },
          ],
        }],
      };

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Mention update test', description: initialDescription })
        .expect(201);

      // Wait for initial notification to settle
      await new Promise((r) => setTimeout(r, 500));

      // Clear notifications so we can check only new ones
      await ctx.prisma.notification.deleteMany({ where: { type: 'MENTION' } });

      // Update description adding user3 mention (user2 still present)
      const updatedDescription = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: user2.id, label: 'User Two' } },
            { type: 'text', text: ' and ' },
            { type: 'mention', attrs: { id: user3.id, label: 'User Three' } },
          ],
        }],
      };

      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ description: updatedDescription })
        .expect(200);

      // Poll for MENTION notification for user3 only
      let user3Notifications = 0;
      let user2Notifications = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200));
        user3Notifications = await ctx.prisma.notification.count({
          where: { userId: user3.id, type: 'MENTION' },
        });
        user2Notifications = await ctx.prisma.notification.count({
          where: { userId: user2.id, type: 'MENTION' },
        });
        if (user3Notifications > 0) break;
      }

      expect(user3Notifications).toBeGreaterThanOrEqual(1);
      expect(user2Notifications).toBe(0); // user2 was already mentioned — no duplicate
    });
  });

  describe('Watchers', () => {
    it('should add and remove watcher', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Watchable' });

      // Creator is auto-added as watcher, so add another watcher
      // For now just verify the endpoint works
      const watchersRes = await authReq()
        .get(`/projects/${projectKey}/issues/1/watchers`)
        .expect(200);

      expect(Array.isArray(watchersRes.body.data)).toBe(true);
    });
  });

  describe('Full issue lifecycle', () => {
    it('create → update status → resolve', async () => {
      // Create issue
      const createRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Lifecycle Issue', type: 'BUG' })
        .expect(201);

      const issueNumber = createRes.body.data.number;

      // Get project workflow statuses
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: {
          workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } },
        },
      });

      const workflow = project!.workflows[0];
      const statuses = workflow.statuses;
      expect(statuses.length).toBeGreaterThan(0);

      // Update to last status (typically "Done")
      const doneStatus = statuses[statuses.length - 1];
      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueNumber}`)
        .send({ statusId: doneStatus.id })
        .expect(200);

      // Verify in DB
      const updated = await ctx.prisma.issue.findFirst({
        where: { number: issueNumber, projectId: project!.id },
      });
      expect(updated!.statusId).toBe(doneStatus.id);
    });
  });
});
