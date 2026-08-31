import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { NotificationType, Prisma } from '@prisma/client';
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
  let adminId: string;
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
    const admin = await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

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

      await ctx.settle();

      const notificationCount = await ctx.prisma.notification.count({
        where: { userId: mentionedUser.id, type: NotificationType.MENTION },
      });
      expect(notificationCount).toBe(1);
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

      // The watcher is added by an event listener — settle before asserting.
      await ctx.settle();

      const proj = await ctx.prisma.project.findFirstOrThrow({ where: { key: projectKey } });
      const issue = await ctx.prisma.issue.findFirstOrThrow({
        where: { number: issueRes.body.data.number, projectId: proj.id },
      });

      const watcher = await ctx.prisma.issueWatcher.findUnique({
        where: { issueId_userId: { issueId: issue.id, userId: mentionedUser.id } },
      });
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

      // Let the create-time notification land, then clear so the assertions
      // below can only see notifications produced by the update.
      await ctx.settle();
      await ctx.prisma.notification.deleteMany({
        where: { type: NotificationType.MENTION },
      });

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

      await ctx.settle();

      const notifiedUserIds = await ctx.prisma.notification.findMany({
        where: { type: NotificationType.MENTION },
        select: { userId: true },
      });
      // Only the newly mentioned user is notified — user2 was already mentioned
      // before the update and must not be notified again.
      expect(notifiedUserIds.map((n) => n.userId)).toEqual([user3.id]);
    });
  });

  describe('Watchers', () => {
    it('should add and remove watcher', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Watchable' })
        .expect(201);

      // The reporter is watched by the create itself; settle so that any
      // listener-side watcher additions have also happened before asserting the
      // exact set.
      await ctx.settle();

      const watcherIds = async (): Promise<string[]> => {
        const res = await authReq()
          .get(`/projects/${projectKey}/issues/1/watchers`)
          .expect(200);
        return res.body.data.map((u: { id: string }) => u.id);
      };

      expect(await watcherIds()).toEqual([adminId]);

      // The endpoints add/remove the *caller*, so the admin can unwatch…
      await authReq().delete(`/projects/${projectKey}/issues/1/watchers`).expect(204);
      expect(await watcherIds()).toEqual([]);

      // …and watch again.
      await authReq().post(`/projects/${projectKey}/issues/1/watchers`).expect(204);
      expect(await watcherIds()).toEqual([adminId]);
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
