import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AssignStrategy, IssueType, Priority } from '@prisma/client';
import { SYSTEM_ROLE_IDS } from '@repo/shared';
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

  describe('POST /projects/:key/auto-assign/preview', () => {
    // The endpoint previews a rule against hypothetical issue data — the type
    // and priority a new issue would carry — so no issues need to exist.
    async function createBugRule(): Promise<string> {
      const res = await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({
          name: 'Bug rule',
          conditions: { issueType: [IssueType.BUG] },
          strategy: AssignStrategy.SPECIFIC_USER,
          assigneeId: adminId,
        })
        .expect(201);
      return res.body.data.id;
    }

    it('reports the matching rule and the assignee it would pick', async () => {
      const ruleId = await createBugRule();

      const res = await authReq()
        .post(`/projects/${projectKey}/auto-assign/preview`)
        .send({ type: IssueType.BUG, priority: Priority.MEDIUM })
        .expect(201);

      expect(res.body.data).toMatchObject({
        matched: true,
        rule: { id: ruleId, name: 'Bug rule' },
      });
      expect(res.body.data.assignee.id).toBe(adminId);
    });

    it('reports no match when no rule conditions apply', async () => {
      await createBugRule();

      const res = await authReq()
        .post(`/projects/${projectKey}/auto-assign/preview`)
        .send({ type: IssueType.TASK, priority: Priority.MEDIUM })
        .expect(201);

      expect(res.body.data).toEqual({
        matched: false,
        assignee: null,
        rule: null,
      });
    });
  });

  // ─── Applied on issue creation ────────────────────────────────────

  describe('assignment on issue create', () => {
    async function createBugRule(): Promise<void> {
      await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({
          name: 'Bugs to admin',
          conditions: { issueType: [IssueType.BUG] },
          strategy: AssignStrategy.SPECIFIC_USER,
          assigneeId: adminId,
        })
        .expect(201);
    }

    async function createIssue(body: Record<string, unknown>) {
      const res = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send(body)
        .expect(201);
      return res.body.data;
    }

    it('assigns a new issue that matches a rule', async () => {
      await createBugRule();

      const issue = await createIssue({ title: 'A bug', type: IssueType.BUG });

      // Assigned by the create itself, not by a follow-up update: the response
      // already carries the assignee.
      expect(issue.assignee?.id).toBe(adminId);
      const stored = await ctx.prisma.issue.findUniqueOrThrow({
        where: { id: issue.id },
      });
      expect(stored.assigneeId).toBe(adminId);
    });

    it('leaves an issue unassigned when no rule matches', async () => {
      await createBugRule();

      const issue = await createIssue({ title: 'A task', type: IssueType.TASK });

      expect(issue.assignee).toBeNull();
    });

    it('leaves an issue unassigned when the project has no rules', async () => {
      const issue = await createIssue({ title: 'A bug', type: IssueType.BUG });

      expect(issue.assignee).toBeNull();
    });

    it('never overrides an assignee the reporter supplied', async () => {
      const reporterHash = await bcrypt.hash('memberpass1', 4);
      const member = await ctx.prisma.user.create({
        data: {
          email: 'member@test.local',
          name: 'Member',
          passwordHash: reporterHash,
          hasPassword: true,
          role: 'USER',
        },
      });
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: member.id, roleId: SYSTEM_ROLE_IDS.DEVELOPER })
        .expect(201);

      await createBugRule();

      const issue = await createIssue({
        title: 'A bug',
        type: IssueType.BUG,
        assigneeId: member.id,
      });

      expect(issue.assignee?.id).toBe(member.id);
    });

    it('skips a rule whose named assignee is no longer a project member', async () => {
      const outsiderHash = await bcrypt.hash('outsiderpass1', 4);
      const outsider = await ctx.prisma.user.create({
        data: {
          email: 'outsider@test.local',
          name: 'Outsider',
          passwordHash: outsiderHash,
          hasPassword: true,
          role: 'USER',
        },
      });
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: outsider.id, roleId: SYSTEM_ROLE_IDS.DEVELOPER })
        .expect(201);

      await authReq()
        .post(`/projects/${projectKey}/auto-assign`)
        .send({
          name: 'Bugs to the outsider',
          conditions: { issueType: [IssueType.BUG] },
          strategy: AssignStrategy.SPECIFIC_USER,
          assigneeId: outsider.id,
        })
        .expect(201);

      // Removing a member does not prune rules pointing at them.
      await authReq()
        .delete(`/projects/${projectKey}/members/${outsider.id}`)
        .expect(204);

      const issue = await createIssue({ title: 'A bug', type: IssueType.BUG });

      expect(issue.assignee).toBeNull();
    });
  });
});
