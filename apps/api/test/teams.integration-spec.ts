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

describe('Teams Integration (full AppModule)', () => {
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

    projectKey = 'TEAM';
    await authReq().post('/projects').send({ key: projectKey, name: 'Team Project' }).expect(201);
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

  async function createProjectMember(email: string) {
    const hash = await bcrypt.hash('pass1', 4);
    const user = await ctx.prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: hash, hasPassword: true, role: 'USER' },
    });
    await authReq()
      .post(`/projects/${projectKey}/members`)
      .send({ userId: user.id, roleId: '00000000-0000-0000-0000-000000000002' })
      .expect(201);
    return user;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  describe('POST /projects/:key/teams', () => {
    it('should create a team', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/teams`)
        .send({ name: 'Backend Team' })
        .expect(201);

      expect(res.body.data.name).toBe('Backend Team');
    });

    it('should reject duplicate team name within project', async () => {
      await authReq().post(`/projects/${projectKey}/teams`).send({ name: 'Frontend' }).expect(201);
      const res = await authReq().post(`/projects/${projectKey}/teams`).send({ name: 'Frontend' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should create team with lead', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/teams`)
        .send({ name: 'Led Team', leadId: adminId })
        .expect(201);

      expect(res.body.data.lead).toBeDefined();
    });
  });

  describe('GET /projects/:key/teams', () => {
    it('should list all teams', async () => {
      await authReq().post(`/projects/${projectKey}/teams`).send({ name: 'Team A' }).expect(201);
      await authReq().post(`/projects/${projectKey}/teams`).send({ name: 'Team B' }).expect(201);

      const res = await authReq().get(`/projects/${projectKey}/teams`).expect(200);
      const items = res.body.data ?? res.body;
      expect(items.length).toBe(2);
    });
  });

  // ─── Members ──────────────────────────────────────────────────────

  describe('Team members', () => {
    it('should add and remove team members', async () => {
      const member = await createProjectMember('dev1@test.local');

      const teamRes = await authReq()
        .post(`/projects/${projectKey}/teams`)
        .send({ name: 'Dev Team' })
        .expect(201);
      const teamId = teamRes.body.data.id;

      // Add member
      await authReq()
        .post(`/projects/${projectKey}/teams/${teamId}/members`)
        .send({ userIds: [member.id] })
        .expect(201);

      // Verify member is in team
      const detailRes = await authReq()
        .get(`/projects/${projectKey}/teams/${teamId}`)
        .expect(200);
      const members: Array<{ id?: string; userId?: string }> =
        detailRes.body.data.members ?? [];
      expect(
        members.some((m) => m.id === member.id || m.userId === member.id),
      ).toBe(true);

      // Remove member
      await authReq()
        .delete(`/projects/${projectKey}/teams/${teamId}/members/${member.id}`)
        .expect(204);

      // Verify member removed
      const afterRes = await authReq()
        .get(`/projects/${projectKey}/teams/${teamId}`)
        .expect(200);
      const afterMembers: Array<{ id?: string; userId?: string }> =
        afterRes.body.data.members ?? [];
      expect(
        afterMembers.some((m) => m.id === member.id || m.userId === member.id),
      ).toBe(false);
    });

    it('should reject adding non-project-member to team', async () => {
      const hash = await bcrypt.hash('pass1', 4);
      const outsider = await ctx.prisma.user.create({
        data: { email: 'outsider@test.local', name: 'Outsider', passwordHash: hash, hasPassword: true, role: 'USER' },
      });

      const teamRes = await authReq()
        .post(`/projects/${projectKey}/teams`)
        .send({ name: 'Strict Team' })
        .expect(201);
      const teamId = teamRes.body.data.id;

      const res = await authReq()
        .post(`/projects/${projectKey}/teams/${teamId}/members`)
        .send({ userIds: [outsider.id] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('DELETE /projects/:key/teams/:teamId', () => {
    it('should delete team', async () => {
      const teamRes = await authReq()
        .post(`/projects/${projectKey}/teams`)
        .send({ name: 'Temp Team' })
        .expect(201);
      const teamId = teamRes.body.data.id;

      await authReq().delete(`/projects/${projectKey}/teams/${teamId}`).expect(204);

      await authReq().get(`/projects/${projectKey}/teams/${teamId}`).expect(404);
    });
  });
});
