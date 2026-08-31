import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { ActivityType, IssueType, Priority, WidgetType } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

/**
 * Extended dashboard widget tests — covers widget CRUD and
 * individual widget data correctness across all widget types.
 */
describe('Dashboard Widgets Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let dashboardId: string;
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

    projectKey = 'WDGT';
    await authReq().post('/projects').send({ key: projectKey, name: 'Widget Project' }).expect(201);

    // Create some issues for widgets to aggregate
    for (let i = 0; i < 3; i++) {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({
          title: `Widget Issue ${i + 1}`,
          priority: i === 0 ? Priority.HIGH : Priority.MEDIUM,
          type: i === 0 ? IssueType.BUG : IssueType.TASK,
        })
        .expect(201);
    }

    // Create dashboard
    const dashRes = await authReq()
      .post('/dashboards')
      .send({ name: 'Widget Test Dashboard' })
      .expect(201);
    dashboardId = dashRes.body.data.id;
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

  async function addWidgetAndGetData(type: WidgetType, title: string) {
    const widgetRes = await authReq()
      .post(`/dashboards/${dashboardId}/widgets`)
      .send({ type, title })
      .expect(201);
    const widgetId = widgetRes.body.data.id;

    const dataRes = await authReq()
      .get(`/dashboards/${dashboardId}/widgets/${widgetId}/data`)
      .expect(200);

    return { widgetId, data: dataRes.body.data };
  }

  // ─── Widget CRUD ──────────────────────────────────────────────────

  describe('Widget CRUD', () => {
    it('should add widget to dashboard', async () => {
      const res = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.MY_ISSUES, title: 'My Issues' })
        .expect(201);

      expect(res.body.data.type).toBe('MY_ISSUES');
      expect(res.body.data.title).toBe('My Issues');
    });

    it('should update widget title', async () => {
      const addRes = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.MY_ISSUES, title: 'Original' })
        .expect(201);
      const widgetId = addRes.body.data.id;

      const updateRes = await authReq()
        .patch(`/dashboards/${dashboardId}/widgets/${widgetId}`)
        .send({ title: 'Renamed Widget' })
        .expect(200);

      expect(updateRes.body.data.title).toBe('Renamed Widget');
    });

    it('should remove widget from dashboard', async () => {
      const addRes = await authReq()
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: WidgetType.MY_ISSUES, title: 'To Remove' })
        .expect(201);
      const widgetId = addRes.body.data.id;

      await authReq()
        .delete(`/dashboards/${dashboardId}/widgets/${widgetId}`)
        .expect(204);

      // Widget data should now 404
      await authReq()
        .get(`/dashboards/${dashboardId}/widgets/${widgetId}/data`)
        .expect(404);
    });
  });

  // ─── Widget Data Correctness ──────────────────────────────────────

  describe('Widget data retrieval', () => {
    /** The `beforeEach` fixture creates exactly these three issues. */
    function countsByName(items: Array<{ name: string; count: number }>) {
      return Object.fromEntries(items.map((i) => [i.name, i.count]));
    }

    it('MY_ISSUES should return issues reported by or assigned to the caller', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.MY_ISSUES, 'My Issues');
      // The admin reported all three fixture issues.
      expect(data.items).toHaveLength(3);
    });

    it('ASSIGNED_TO_ME should return empty when no assignments', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.ASSIGNED_TO_ME, 'Assigned');
      // The fixture issues are created without an assignee, and this project has
      // no auto-assign rule — so the widget must be empty, not merely defined.
      expect(data.items).toEqual([]);
    });

    it('ISSUES_BY_PRIORITY should return correct priority distribution', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.ISSUES_BY_PRIORITY, 'By Priority');
      expect(countsByName(data.items)).toEqual({
        [Priority.HIGH]: 1,
        [Priority.MEDIUM]: 2,
      });
    });

    it('ISSUES_BY_TYPE should return correct type distribution', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.ISSUES_BY_TYPE, 'By Type');
      expect(countsByName(data.items)).toEqual({
        [IssueType.BUG]: 1,
        [IssueType.TASK]: 2,
      });
    });

    it('ISSUES_BY_STATUS should return correct status counts', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.ISSUES_BY_STATUS, 'By Status');
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(1);

      // All issues are in Open status by default
      const totalCount = data.items.reduce(
        (sum: number, i: { count: number }) => sum + i.count,
        0,
      );
      expect(totalCount).toBe(3);
    });

    it('PROJECT_PROGRESS should show progress for user projects', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.PROJECT_PROGRESS, 'Progress');
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      expect(data.items[0].totalIssueCount).toBeGreaterThanOrEqual(3);
    });

    it('TIME_SPENT_TODAY should return empty with no time logs', async () => {
      const { data } = await addWidgetAndGetData(WidgetType.TIME_SPENT_TODAY, 'Time');
      expect(data.totalMinutes).toBe(0);
      expect(data.entries).toEqual([]);
    });

    it('OVERDUE_ISSUES should return issues past due date', async () => {
      // Create an issue with past due date
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Overdue', dueDate: '2020-01-01T00:00:00.000Z' })
        .expect(201);

      const { data } = await addWidgetAndGetData(WidgetType.OVERDUE_ISSUES, 'Overdue');
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      expect(data.items[0].title).toBe('Overdue');
    });

    it('RECENT_ACTIVITY should show recent activity entries', async () => {
      // Activities are written by the issue.created listener.
      await ctx.settle();

      const { data } = await addWidgetAndGetData(WidgetType.RECENT_ACTIVITY, 'Activity');
      // One ISSUE_CREATED per fixture issue; the widget's own cap is 15.
      expect(
        data.items.filter(
          (i: { type: string }) => i.type === ActivityType.ISSUE_CREATED,
        ),
      ).toHaveLength(3);
    });
  });
});
