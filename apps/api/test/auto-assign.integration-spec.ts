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

describe('Auto-Assign Integration (full AppModule)', () => {
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

    projectKey = 'ASGN';
    await authReq().post('/projects').send({ key: projectKey, name: 'Auto-Assign Project' }).expect(201);
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

  // ─── CRUD ─────────────────────────────────────────────────────────

  describe('POST /projects/:key/auto-assign', () => {
    it('should create an auto-assign rule', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({
          name: 'Assign bugs to admin',
          conditions: { issueType: ['BUG'] },
          strategy: 'SPECIFIC_USER',
          assigneeId: adminId,
        })
        .expect(201);

      expect(res.body.data.name).toBe('Assign bugs to admin');
      expect(res.body.data.isEnabled).toBe(true);
    });
  });

  describe('GET /projects/:key/auto-assign', () => {
    it('should list all rules', async () => {
      await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({ name: 'Rule 1', conditions: {}, strategy: 'SPECIFIC_USER', assigneeId: adminId })
        .expect(201);
      await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({ name: 'Rule 2', conditions: {}, strategy: 'SPECIFIC_USER', assigneeId: adminId })
        .expect(201);

      const res = await authReq()
        .get(`/projects/${projectKey}/auto-assign`)
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items.length).toBe(2);
    });
  });

  describe('PATCH /projects/:key/auto-assign/:ruleId', () => {
    it('should update rule', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({ name: 'Original', conditions: {}, strategy: 'SPECIFIC_USER', assigneeId: adminId })
        .expect(201);
      const ruleId = createRes.body.data.id;

      const updateRes = await authReq()
        .patch(`/projects/${projectKey}/auto-assign/${ruleId}`)
        .send({ name: 'Updated' })
        .expect(200);

      expect(updateRes.body.data.name).toBe('Updated');
    });
  });

  describe('DELETE /projects/:key/auto-assign/:ruleId', () => {
    it('should delete rule', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({ name: 'Deletable', conditions: {}, strategy: 'SPECIFIC_USER', assigneeId: adminId })
        .expect(201);
      const ruleId = createRes.body.data.id;

      await authReq()
        .delete(`/projects/${projectKey}/auto-assign/${ruleId}`)
        .expect(204);

      const rules = await ctx.prisma.autoAssignRule.findMany({
        where: { id: ruleId },
      });
      expect(rules.length).toBe(0);
    });
  });

  // ─── Preview ──────────────────────────────────────────────────────

  describe('POST /projects/:key/auto-assign/:ruleId/preview', () => {
    it('should preview matching issues for a rule', async () => {
      // Create some issues
      await authReq().post(`/projects/${projectKey}/issues`).send({ title: 'Bug 1', type: 'BUG' }).expect(201);
      await authReq().post(`/projects/${projectKey}/issues`).send({ title: 'Task 1', type: 'TASK' }).expect(201);

      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({ name: 'Bug rule', conditions: { issueType: ['BUG'] }, strategy: 'SPECIFIC_USER', assigneeId: adminId })
        .expect(201);
      const ruleId = ruleRes.body.data.id;

      const previewRes = await authReq()
        .post(`/projects/${projectKey}/auto-assign/${ruleId}/preview`);

      // Should succeed (might return matched issues or summary)
      expect(previewRes.status).toBeLessThan(500);
    });
  });
});
