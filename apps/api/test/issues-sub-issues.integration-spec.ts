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

describe('Issues Sub-Issues Integration (full AppModule)', () => {
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

    projectKey = 'SUB';
    await authReq().post('/projects').send({ key: projectKey, name: 'Sub-Issues Project' }).expect(201);
  });

  function authReq() {
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${adminToken}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${adminToken}`),
      patch: (url: string) =>
        request(ctx.app.getHttpServer()).patch(url).set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer()).delete(url).set('Authorization', `Bearer ${adminToken}`),
    };
  }

  async function createIssue(title: string) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title })
      .expect(201);
    return res.body.data;
  }

  // ─── Parent-Child Relationships ───────────────────────────────────

  describe('Set parent (sub-issues)', () => {
    it('should set parent on issue', async () => {
      const parent = await createIssue('Epic: Auth Overhaul');
      const child = await createIssue('Task: Implement JWT refresh');

      await authReq()
        .patch(`/projects/${projectKey}/issues/${child.number}`)
        .send({ parentId: parent.id })
        .expect(200);

      // Verify child has parent in DB
      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const childIssue = await ctx.prisma.issue.findFirst({
        where: { number: child.number, projectId: project!.id },
      });
      expect(childIssue!.parentId).toBe(parent.id);
    });

    it('should list children of parent issue', async () => {
      const parent = await createIssue('Parent Issue');
      const child1 = await createIssue('Child 1');
      const child2 = await createIssue('Child 2');

      await authReq().patch(`/projects/${projectKey}/issues/${child1.number}`).send({ parentId: parent.id }).expect(200);
      await authReq().patch(`/projects/${projectKey}/issues/${child2.number}`).send({ parentId: parent.id }).expect(200);

      const childrenRes = await authReq()
        .get(`/projects/${projectKey}/issues/${parent.number}/children`)
        .expect(200);

      const children = childrenRes.body.data ?? childrenRes.body;
      expect(children.length).toBe(2);
    });

    it('should remove parent by setting null', async () => {
      const parent = await createIssue('Parent');
      const child = await createIssue('Child');

      await authReq().patch(`/projects/${projectKey}/issues/${child.number}`).send({ parentId: parent.id }).expect(200);

      // Remove parent
      await authReq().patch(`/projects/${projectKey}/issues/${child.number}`).send({ parentId: null }).expect(200);

      const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });
      const childIssue = await ctx.prisma.issue.findFirst({
        where: { number: child.number, projectId: project!.id },
      });
      expect(childIssue!.parentId).toBeNull();
    });

    it('should reject self-referencing parent', async () => {
      const issue = await createIssue('Self-Referencing');

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/${issue.number}`)
        .send({ parentId: issue.id });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject circular parent chain (A→B→A)', async () => {
      const issueA = await createIssue('Issue A');
      const issueB = await createIssue('Issue B');

      // A is parent of B
      await authReq().patch(`/projects/${projectKey}/issues/${issueB.number}`).send({ parentId: issueA.id }).expect(200);

      // B as parent of A should fail (cycle)
      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/${issueA.number}`)
        .send({ parentId: issueB.id });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject deep circular chain (A→B→C→A)', async () => {
      const a = await createIssue('A');
      const b = await createIssue('B');
      const c = await createIssue('C');

      await authReq().patch(`/projects/${projectKey}/issues/${b.number}`).send({ parentId: a.id }).expect(200);
      await authReq().patch(`/projects/${projectKey}/issues/${c.number}`).send({ parentId: b.id }).expect(200);

      // C→A would create cycle: A→B→C→A
      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/${a.number}`)
        .send({ parentId: c.id });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
