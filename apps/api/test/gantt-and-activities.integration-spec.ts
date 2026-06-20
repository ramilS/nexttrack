import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Activity, ActivityType, DeliveryChannel, OutboxStatus } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Gantt & Activities Integration (full AppModule)', () => {
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

    projectKey = 'GANT';
    await authReq().post('/projects').send({ key: projectKey, name: 'Gantt Project' }).expect(201);
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

  // ─── Gantt ────────────────────────────────────────────────────────

  describe('GET /projects/:key/gantt', () => {
    it('should return gantt data for project issues', async () => {
      // Create issues with dates
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Gantt Issue 1', dueDate: `${nextWeek}T00:00:00.000Z` })
        .expect(201);
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Gantt Issue 2' })
        .expect(201);

      const res = await authReq()
        .get(`/projects/${projectKey}/gantt`)
        .expect(200);

      const data = res.body.data;
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by date range', async () => {
      const farFuture = '2030-01-01';
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Far Future Issue', dueDate: `${farFuture}T00:00:00.000Z` })
        .expect(201);

      // Query only near future — far future issue should not appear
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const res = await authReq()
        .get(`/projects/${projectKey}/gantt?to=${nextMonth}`)
        .expect(200);

      const data = res.body.data;
      const titles = data.items.map((i: { title: string }) => i.title);
      expect(titles).not.toContain('Far Future Issue');
    });

    it('should support groupBy=ASSIGNEE', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Grouped Issue' })
        .expect(201);

      const res = await authReq()
        .get(`/projects/${projectKey}/gantt?groupBy=ASSIGNEE`)
        .expect(200);

      // Should have groups array when groupBy is specified
      expect(res.body.data).toBeDefined();
    });
  });

  // ─── Activities (auto-recorded) ───────────────────────────────────

  describe('Activities auto-recording', () => {
    it('should record activity when issue is created', async () => {
      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Activity Test Issue' })
        .expect(201);

      const issueNumber = issueRes.body.data.number;

      await ctx.pumpDomainEvents();

      const activitiesRes = await authReq()
        .get(`/projects/${projectKey}/issues/${issueNumber}/activities`)
        .expect(200);

      const items = activitiesRes.body.data?.items ?? activitiesRes.body.items ?? [];
      const types = items.map((a: { type: string }) => a.type);
      expect(types).toContain('ISSUE_CREATED');
    });

    it('should record activity when issue status changes', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Status Change Issue' })
        .expect(201);

      // Get workflow statuses
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      const statuses = project!.workflows[0].statuses as Array<{
        id: string;
        name: string;
      }>;
      const inProgressStatus = statuses.find((s) => s.name === 'In Progress');

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ statusId: inProgressStatus!.id })
        .expect(200);

      await ctx.pumpDomainEvents();

      const activitiesRes = await authReq()
        .get(`/projects/${projectKey}/issues/1/activities`)
        .expect(200);

      const items = activitiesRes.body.data?.items ?? activitiesRes.body.items ?? [];
      const types = items.map((a: { type: string }) => a.type);
      expect(types).toContain('STATUS_CHANGE');
    });

    it('should record activity when issue priority changes', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Priority Change Issue', priority: 'LOW' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ priority: 'CRITICAL' })
        .expect(200);

      await ctx.pumpDomainEvents();

      const activitiesRes = await authReq()
        .get(`/projects/${projectKey}/issues/1/activities`)
        .expect(200);

      const items = activitiesRes.body.data?.items ?? activitiesRes.body.items ?? [];
      const types = items.map((a: { type: string }) => a.type);
      expect(types).toContain('PRIORITY_CHANGE');
    });

    it('should record activity when issue is deleted', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Delete Activity' })
        .expect(201);

      await authReq().delete(`/projects/${projectKey}/issues/1`).expect(204);

      // Check DB directly since the issue endpoint returns 404 (event listener runs async)
      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      let activities: Activity[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        activities = await ctx.prisma.activity.findMany({
          where: {
            issue: { number: 1, projectId: project!.id },
            type: 'ISSUE_DELETED',
          },
        });
        if (activities.length > 0) break;
      }
      expect(activities.length).toBe(1);
    });

    it('should filter activities by type', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Filter Test', priority: 'LOW' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/1`)
        .send({ priority: 'HIGH' })
        .expect(200);

      await ctx.pumpDomainEvents();

      // Filter to only show PRIORITY_CHANGE
      const res = await authReq()
        .get(`/projects/${projectKey}/issues/1/activities?types=PRIORITY_CHANGE`)
        .expect(200);

      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items.every((a: { type: string }) => a.type === 'PRIORITY_CHANGE')).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Idempotent redelivery (at-least-once)', () => {
    it('does not duplicate activities when the same event is delivered twice', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Redelivery Test' })
        .expect(201);

      await ctx.pumpDomainEvents();

      // Simulate redelivery: flip the processed event back to PENDING so the
      // pump emits it again with the same eventId.
      const reset = await ctx.prisma.outboxEvent.updateMany({
        where: { eventType: 'issue.created', channel: DeliveryChannel.INTERNAL },
        data: { status: OutboxStatus.PENDING, processedAt: null },
      });
      expect(reset.count).toBe(1);

      await ctx.pumpDomainEvents();

      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const activities = await ctx.prisma.activity.findMany({
        where: {
          issue: { number: 1, projectId: project!.id },
          type: ActivityType.ISSUE_CREATED,
        },
      });
      expect(activities.length).toBe(1);

      const keys = await ctx.prisma.idempotencyKey.findMany();
      expect(keys.some((k) => k.key.endsWith(':activity'))).toBe(true);
    });
  });
});
