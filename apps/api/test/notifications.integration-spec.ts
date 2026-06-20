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

describe('Notifications Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

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

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(res.headers["set-cookie"]);
  });

  function authReq(token?: string) {
    const t = token ?? adminToken;
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${t}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${t}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${t}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer()).delete(url).set('Authorization', `Bearer ${t}`),
    };
  }

  async function seedNotification(overrides: Partial<{ userId: string; type: NotificationType; isRead: boolean }> = {}) {
    return ctx.prisma.notification.create({
      data: {
        userId: overrides.userId ?? adminId,
        type: overrides.type ?? NotificationType.ISSUE_ASSIGNED,
        payload: { message: 'Test notification' },
        isRead: overrides.isRead ?? false,
      },
    });
  }

  // ─── Listing & Pagination ─────────────────────────────────────────

  describe('GET /notifications', () => {
    it('should return paginated notifications for current user', async () => {
      await seedNotification();
      await seedNotification({ type: NotificationType.COMMENT_ADD });
      await seedNotification({ isRead: true });

      const res = await authReq().get('/notifications?pageSize=10').expect(200);

      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items.length).toBe(3);
    });

    it('should filter by read status', async () => {
      await seedNotification({ isRead: false });
      await seedNotification({ isRead: true });

      const res = await authReq().get('/notifications?isRead=false&pageSize=10').expect(200);

      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items.length).toBe(1);
      expect(items[0].isRead).toBe(false);
    });

    it('should not return notifications belonging to another user', async () => {
      const hash = await bcrypt.hash('pass1', 4);
      const other = await ctx.prisma.user.create({
        data: { email: 'other@test.local', name: 'Other', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      await seedNotification({ userId: other.id });

      const res = await authReq().get('/notifications?pageSize=50').expect(200);
      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items.length).toBe(0);
    });
  });

  // ─── Unread Count ─────────────────────────────────────────────────

  describe('GET /notifications/unread-count', () => {
    it('should return correct unread count', async () => {
      await seedNotification({ isRead: false });
      await seedNotification({ isRead: false });
      await seedNotification({ isRead: true });

      const res = await authReq().get('/notifications/unread-count').expect(200);
      const count = res.body.data?.count ?? res.body.count ?? res.body.data;
      expect(count).toBe(2);
    });
  });

  // ─── Mark as Read ─────────────────────────────────────────────────

  describe('PATCH /notifications/read', () => {
    it('should mark specific notifications as read', async () => {
      const n1 = await seedNotification();
      const n2 = await seedNotification();
      await seedNotification(); // stays unread

      await authReq()
        .patch('/notifications/read')
        .send({ notificationIds: [n1.id, n2.id] })
        .expect(200);

      // Verify in DB
      const updated = await ctx.prisma.notification.findMany({
        where: { id: { in: [n1.id, n2.id] } },
      });
      expect(updated.every((n) => n.isRead)).toBe(true);

      // The third should still be unread
      const countRes = await authReq().get('/notifications/unread-count').expect(200);
      const count = countRes.body.data?.count ?? countRes.body.count ?? countRes.body.data;
      expect(count).toBe(1);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      await seedNotification();
      await seedNotification();
      await seedNotification();

      await authReq().patch('/notifications/read-all').expect(200);

      const unread = await ctx.prisma.notification.count({
        where: { userId: adminId, isRead: false },
      });
      expect(unread).toBe(0);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('DELETE /notifications/:id', () => {
    it('should delete own notification', async () => {
      const n = await seedNotification();

      await authReq().delete(`/notifications/${n.id}`).expect(204);

      const found = await ctx.prisma.notification.findUnique({ where: { id: n.id } });
      expect(found).toBeNull();
    });

    it('should not delete another user notification', async () => {
      const hash = await bcrypt.hash('pass1', 4);
      const other = await ctx.prisma.user.create({
        data: { email: 'other2@test.local', name: 'Other', passwordHash: hash, hasPassword: true, role: 'USER' },
      });
      const n = await seedNotification({ userId: other.id });

      const res = await authReq().delete(`/notifications/${n.id}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── Preferences ──────────────────────────────────────────────────

  describe('Notification Preferences', () => {
    it('should return default preferences on first access', async () => {
      const res = await authReq().get('/notifications/preferences').expect(200);
      const prefs = res.body.data;

      expect(prefs.emailEnabled).toBe(true);
      expect(prefs.emailMode).toBe('INSTANT');
      // Preferences are keyed by userId (one row per user) — clients use it as
      // the stable key. There is no separate `id` in the response.
      expect(prefs.userId).toBe(adminId);
    });

    it('should update preferences', async () => {
      await authReq()
        .patch('/notifications/preferences')
        .send({
          emailMode: 'DIGEST',
          emailEnabled: false,
          channelSettings: {
            ISSUE_ASSIGNED: { inApp: true, email: false },
          },
        })
        .expect(200);

      const res = await authReq().get('/notifications/preferences').expect(200);
      const prefs = res.body.data;
      expect(prefs.emailMode).toBe('DIGEST');
      expect(prefs.emailEnabled).toBe(false);
    });
  });

  // ─── End-to-end: Issue assignment triggers notification ────────────

  describe('Notification dispatch on issue assignment', () => {
    it('should create in-app notification when issue is assigned', async () => {
      // Create a second user
      const hash = await bcrypt.hash('pass1', 4);
      const assignee = await ctx.prisma.user.create({
        data: { email: 'dev@test.local', name: 'Developer', passwordHash: hash, hasPassword: true, role: 'USER' },
      });

      // Enable inApp notifications for ISSUE_ASSIGNED on the assignee
      await ctx.prisma.notificationPreferences.create({
        data: {
          userId: assignee.id,
          channelSettings: {
            ISSUE_ASSIGNED: { inApp: true, email: false },
          } satisfies Prisma.InputJsonValue,
        },
      });

      // Create project and add assignee as member
      await authReq().post('/projects').send({ key: 'NOTF', name: 'Notification Test' }).expect(201);
      await authReq()
        .post('/projects/NOTF/members')
        .send({ userId: assignee.id, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Create issue
      const issueRes = await authReq()
        .post('/projects/NOTF/issues')
        .send({ title: 'Assign me' })
        .expect(201);

      // Assign to dev
      await authReq()
        .patch(`/projects/NOTF/issues/${issueRes.body.data.number}`)
        .send({ assigneeId: assignee.id })
        .expect(200);

      // Dispatch is fire-and-forget — poll for the notification (up to 3s)
      let notificationCount = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200));
        notificationCount = await ctx.prisma.notification.count({
          where: { userId: assignee.id, type: NotificationType.ISSUE_ASSIGNED },
        });
        if (notificationCount > 0) break;
      }

      // Notification dispatch is async; verify it was created
      // If the dispatch service is available, we expect at least 1 notification
      expect(notificationCount).toBeGreaterThanOrEqual(1);
    });
  });
});
