import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

/**
 * Integration tests for:
 * 1. Soft-delete cascades — verify related data is properly hidden/cleaned
 * 2. Multi-tenant data isolation — verify project data doesn't leak between users
 * 3. Bulk operations — verify atomicity and correct side effects
 */
describe('Cascade & Isolation Integration', () => {
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

  async function createUserAndLogin(email: string, role: 'ADMIN' | 'USER' = 'USER') {
    const hash = await bcrypt.hash('password1', 4);
    const user = await ctx.prisma.user.create({
      data: {
        email,
        name: email.split('@')[0],
        passwordHash: hash,
        hasPassword: true,
        role,
      },
    });
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);
    return { userId: user.id, token: extractAccessTokenFromCookies(res.headers["set-cookie"]) };
  }

  // ─── Issue Soft-Delete Cascades ────────────────────────────────────

  describe('Issue soft-delete hides related data', () => {
    let projectKey: string;

    beforeEach(async () => {
      projectKey = 'CASC';
      await authReq().post('/projects').send({ key: projectKey, name: 'Cascade Project' }).expect(201);
    });

    it('should hide deleted issue from listing and search', async () => {
      await authReq().post(`/projects/${projectKey}/issues`).send({ title: 'Visible Issue' }).expect(201);
      await authReq().post(`/projects/${projectKey}/issues`).send({ title: 'To Delete' }).expect(201);

      // Delete issue #2
      await authReq().delete(`/projects/${projectKey}/issues/2`).expect(204);

      // Listing should only show issue #1
      const listRes = await authReq().get(`/projects/${projectKey}/issues?page=1&perPage=50`).expect(200);
      const titles = listRes.body.items.map((i: { title: string }) => i.title);
      expect(titles).toContain('Visible Issue');
      expect(titles).not.toContain('To Delete');
    });

    it('should return 404 for issue detail after soft-delete', async () => {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Issue With Comment' })
        .expect(201);

      // Soft-delete the issue
      await authReq().delete(`/projects/${projectKey}/issues/1`).expect(204);

      // Issue detail should return 404
      await authReq().get(`/projects/${projectKey}/issues/1`).expect(404);
    });

    it('should allow restoring a soft-deleted issue', async () => {
      await authReq().post(`/projects/${projectKey}/issues`).send({ title: 'Restorable' }).expect(201);

      await authReq().delete(`/projects/${projectKey}/issues/1`).expect(204);

      await authReq().post(`/projects/${projectKey}/issues/1/restore`).expect(200);

      // Should be visible again
      const res = await authReq().get(`/projects/${projectKey}/issues/1`).expect(200);
      expect(res.body.data.title).toBe('Restorable');
    });
  });

  // ─── Project Soft-Delete ──────────────────────────────────────────

  describe('Project soft-delete hides all project data', () => {
    it('should hide project and its issues after deletion', async () => {
      await authReq().post('/projects').send({ key: 'DEL1', name: 'Deletable' }).expect(201);
      await authReq().post('/projects/DEL1/issues').send({ title: 'Issue in DEL1' }).expect(201);

      // Resolve all issues first (project delete requires no open issues)
      const project = await ctx.prisma.project.findFirst({
        where: { key: 'DEL1' },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      const statuses = project!.workflows[0].statuses;
      const doneStatus = statuses.find((s) => s.isResolved);
      await authReq().patch('/projects/DEL1/issues/1').send({ statusId: doneStatus!.id }).expect(200);

      // Delete project
      await authReq().delete('/projects/DEL1').expect(204);

      // Project should not appear in listing
      const listRes = await authReq().get('/projects').expect(200);
      const keys = (listRes.body.data ?? listRes.body.items ?? listRes.body).map(
        (p: { key: string }) => p.key,
      );
      expect(keys).not.toContain('DEL1');
    });

    it('should reject deletion of project with open issues', async () => {
      await authReq().post('/projects').send({ key: 'OPEN', name: 'Has Open' }).expect(201);
      await authReq().post('/projects/OPEN/issues').send({ title: 'Open Issue' }).expect(201);

      // Try to delete — should fail
      const res = await authReq().delete('/projects/OPEN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── User Soft-Delete Cascades ────────────────────────────────────

  describe('User soft-delete invalidates sessions', () => {
    it('should revoke refresh tokens and mark user as deleted', async () => {
      const { userId } = await createUserAndLogin('victim@test.local');

      // Delete user as admin
      await authReq().delete(`/users/${userId}`).expect(204);

      // Verify user is soft-deleted in DB
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      expect(user!.deletedAt).not.toBeNull();

      // Verify all refresh tokens are revoked
      const tokens = await ctx.prisma.refreshToken.findMany({
        where: { userId, revokedAt: null },
      });
      expect(tokens).toHaveLength(0);
    });

    it('should not allow self-deletion', async () => {
      // Admin trying to delete themselves
      const meRes = await authReq().get('/users/me').expect(200);
      const myId = meRes.body.data.id;

      const deleteRes = await authReq().delete(`/users/${myId}`);
      expect(deleteRes.status).toBeGreaterThanOrEqual(400);
      expect(deleteRes.status).toBeLessThan(500);
    });
  });

  // ─── Multi-Tenant Data Isolation ──────────────────────────────────

  describe('Multi-tenant data isolation', () => {
    let userAToken: string;
    let userBToken: string;

    beforeEach(async () => {
      const userA = await createUserAndLogin('usera@test.local');
      const userB = await createUserAndLogin('userb@test.local');
      userAToken = userA.token;
      userBToken = userB.token;

      // Admin creates two projects
      await authReq().post('/projects').send({ key: 'PRJA', name: 'Project A' }).expect(201);
      await authReq().post('/projects').send({ key: 'PRJB', name: 'Project B' }).expect(201);

      // Add userA to PRJA only, userB to PRJB only
      await authReq()
        .post('/projects/PRJA/members')
        .send({ userId: userA.userId, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);
      await authReq()
        .post('/projects/PRJB/members')
        .send({ userId: userB.userId, roleId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      // Create issues in each project
      await authReq().post('/projects/PRJA/issues').send({ title: 'Secret A Issue' }).expect(201);
      await authReq().post('/projects/PRJB/issues').send({ title: 'Secret B Issue' }).expect(201);
    });

    it('userA should not see issues from PRJB', async () => {
      const res = await authReq(userAToken).get('/projects/PRJB/issues?page=1&perPage=50');
      // Should be 403 (no access) or empty list
      if (res.status === 200) {
        expect(res.body.items ?? []).toHaveLength(0);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('userB should not see issues from PRJA', async () => {
      const res = await authReq(userBToken).get('/projects/PRJA/issues?page=1&perPage=50');
      if (res.status === 200) {
        expect(res.body.items ?? []).toHaveLength(0);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('userA should not be able to create issues in PRJB', async () => {
      const res = await authReq(userAToken)
        .post('/projects/PRJB/issues')
        .send({ title: 'Sneaky Issue' });
      expect(res.status).toBe(403);
    });

    it('userA dashboard widgets should only show data from their projects', async () => {
      // Create dashboard for userA
      const dashRes = await authReq(userAToken)
        .post('/dashboards')
        .send({ name: 'User A Dashboard' })
        .expect(201);
      const dashboardId = dashRes.body.data.id;

      const widgetRes = await authReq(userAToken)
        .post(`/dashboards/${dashboardId}/widgets`)
        .send({ type: 'MY_ISSUES', title: 'My Issues' })
        .expect(201);
      const widgetId = widgetRes.body.data.id;

      const dataRes = await authReq(userAToken)
        .get(`/dashboards/${dashboardId}/widgets/${widgetId}/data`)
        .expect(200);

      // Should not contain any issue from PRJB
      const items = dataRes.body.data?.items ?? [];
      const projectKeys = items.map((i: { projectKey: string }) => i.projectKey);
      expect(projectKeys).not.toContain('PRJB');
    });
  });

  // ─── Bulk Operations ──────────────────────────────────────────────

  describe('Bulk issue update', () => {
    let projectKey: string;

    beforeEach(async () => {
      projectKey = 'BULK';
      await authReq().post('/projects').send({ key: projectKey, name: 'Bulk Project' }).expect(201);

      for (let i = 0; i < 5; i++) {
        await authReq()
          .post(`/projects/${projectKey}/issues`)
          .send({ title: `Bulk Issue ${i + 1}` })
          .expect(201);
      }
    });

    it('should update priority for multiple issues at once', async () => {
      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const issues = await ctx.prisma.issue.findMany({
        where: { projectId: project!.id, deletedAt: null },
        select: { id: true },
      });
      const issueIds = issues.map((i) => i.id);

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/bulk`)
        .send({ issueIds, update: { priority: 'HIGH' } })
        .expect(200);

      expect(res.body.data.updated).toBe(5);

      // Verify in DB
      const updated = await ctx.prisma.issue.findMany({
        where: { id: { in: issueIds } },
        select: { priority: true },
      });
      expect(updated.every((i) => i.priority === 'HIGH')).toBe(true);
    });

    it('should skip non-existent issues in bulk update without failing', async () => {
      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const issues = await ctx.prisma.issue.findMany({
        where: { projectId: project!.id, deletedAt: null },
        select: { id: true },
        take: 2,
      });
      const validIds = issues.map((i) => i.id);
      const fakeId = '00000000-0000-0000-0000-ffffffffffff';

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/bulk`)
        .send({ issueIds: [...validIds, fakeId], update: { priority: 'LOW' } })
        .expect(200);

      expect(res.body.data.updated).toBe(2);
      expect(res.body.data.failed).toContain(fakeId);
    });
  });
});
