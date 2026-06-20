import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { WidgetType } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Dashboards Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;

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

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(res.headers["set-cookie"]);
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

  // ─── Issues by Status: cross-project merging ─────────────────────

  describe('GET /dashboards/:id/widgets/:widgetId/data — ISSUES_BY_STATUS', () => {
    it('should merge statuses with the same name across multiple projects', async () => {
      // Create two projects (each gets a default workflow with Open, In Progress, Done, etc.)
      await authReq().post('/projects').send({ key: 'PRJA', name: 'Project A' }).expect(201);
      await authReq().post('/projects').send({ key: 'PRJB', name: 'Project B' }).expect(201);

      // Create issues in both projects — they'll have "Open" status by default
      await authReq().post('/projects/PRJA/issues').send({ title: 'Issue A1' }).expect(201);
      await authReq().post('/projects/PRJA/issues').send({ title: 'Issue A2' }).expect(201);
      await authReq().post('/projects/PRJB/issues').send({ title: 'Issue B1' }).expect(201);

      // Create a dashboard with ISSUES_BY_STATUS widget
      const dashRes = await authReq()
        .post('/dashboards')
        .send({ name: 'Test Dashboard' })
        .expect(201);
      const dashboardId = dashRes.body.data.id;

      const widgetRes = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.ISSUES_BY_STATUS, title: 'By Status' })
        .expect(201);
      const widgetId = widgetRes.body.data.id;

      // Fetch widget data
      const dataRes = await authReq()
        .get(`/dashboards/${dashboardId}/widgets/${widgetId}/data`)
        .expect(200);

      const items = dataRes.body.data.items;

      // "Open" should appear exactly once (merged from both projects), not twice
      const openEntries = items.filter((i: { name: string }) => i.name === 'Open');
      expect(openEntries).toHaveLength(1);
      expect(openEntries[0].count).toBe(3);

      // Every status name should be unique in the result
      const names = items.map((i: { name: string }) => i.name);
      const uniqueNames = [...new Set(names)];
      expect(names).toEqual(uniqueNames);
    });
  });

  // ─── Batch widget data endpoint ──────────────────────────────────

  describe('GET /dashboards/:id/widgets-data', () => {
    it('should return all widget data in a single response', async () => {
      // Create a project with some issues
      await authReq().post('/projects').send({ key: 'DASH', name: 'Dashboard Test' }).expect(201);
      await authReq().post('/projects/DASH/issues').send({ title: 'Issue 1' }).expect(201);
      await authReq().post('/projects/DASH/issues').send({ title: 'Issue 2' }).expect(201);

      // Create dashboard with multiple widgets
      const dashRes = await authReq()
        .post('/dashboards')
        .send({ name: 'Multi Widget Dashboard' })
        .expect(201);
      const dashboardId = dashRes.body.data.id;

      const widget1Res = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.ISSUES_BY_STATUS, title: 'By Status' })
        .expect(201);

      const widget2Res = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.ISSUES_BY_PRIORITY, title: 'By Priority' })
        .expect(201);

      const widget3Res = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.MY_ISSUES, title: 'My Issues' })
        .expect(201);

      const w1Id = widget1Res.body.data.id;
      const w2Id = widget2Res.body.data.id;
      const w3Id = widget3Res.body.data.id;

      // Fetch all widget data in one call
      const batchRes = await authReq()
        .get(`/dashboards/${dashboardId}/widgets-data`)
        .expect(200);

      const batchData = batchRes.body.data;

      // Should have data for all 3 widgets keyed by widget ID
      expect(batchData).toHaveProperty(w1Id);
      expect(batchData).toHaveProperty(w2Id);
      expect(batchData).toHaveProperty(w3Id);

      // Verify the data is valid (not null)
      expect(batchData[w1Id].items).toBeDefined();
      expect(batchData[w2Id].items).toBeDefined();
      expect(batchData[w3Id].items).toBeDefined();
    });

    it('should return 404 for non-existent dashboard', async () => {
      await authReq()
        .get('/dashboards/00000000-0000-0000-0000-000000000099/widgets-data')
        .expect(404);
    });

    it('should return 404 when accessing another user dashboard', async () => {
      // Create dashboard as admin
      const dashRes = await authReq()
        .post('/dashboards')
        .send({ name: 'Admin Dashboard' })
        .expect(201);
      const dashboardId = dashRes.body.data.id;

      // Create second user and login
      const hash = await bcrypt.hash('userpass1', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'user2@test.local',
          name: 'User Two',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user2@test.local', password: 'userpass1' })
        .expect(200);
      const userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      // User2 should not be able to fetch admin's dashboard data
      await request(ctx.app.getHttpServer())
        .get(`/dashboards/${dashboardId}/widgets-data`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });
});
