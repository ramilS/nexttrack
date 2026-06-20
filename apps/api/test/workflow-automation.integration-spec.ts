import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Issue, WorkflowRuleExecution } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

interface WorkflowStatusRow {
  id: string;
  name: string;
  isInitial: boolean;
  isResolved: boolean;
}

// Workflow.statuses is a Prisma Json column; typed accessor centralises the
// single cast from the loose JSON value to the known status shape.
function readStatuses(statuses: unknown): WorkflowStatusRow[] {
  return (statuses ?? []) as WorkflowStatusRow[];
}

describe('Workflow Automation Integration (full AppModule)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let workflowId: string;

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

    projectKey = 'AUTO';
    await authReq().post('/projects').send({ key: projectKey, name: 'Automation Project' }).expect(201);

    // Get the default workflow
    const project = await ctx.prisma.project.findFirst({
      where: { key: projectKey },
      include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
    });
    workflowId = project!.workflows[0].id;
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

  function makeRule(overrides: Record<string, unknown> = {}) {
    return {
      workflowId,
      name: 'Auto-assign bugs',
      trigger: 'ON_CREATE',
      conditions: { field: 'type', op: 'eq', value: 'BUG' },
      actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
      ...overrides,
    };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  describe('POST /projects/:key/workflow-rules', () => {
    it('should create a workflow rule', async () => {
      const res = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);

      expect(res.body.data.name).toBe('Auto-assign bugs');
      expect(res.body.data.trigger).toBe('ON_CREATE');
      expect(res.body.data.isEnabled).toBe(true);
    });
  });

  describe('GET /projects/:key/workflow-rules', () => {
    it('should list all rules', async () => {
      await authReq().post(`/projects/${projectKey}/workflow-rules`).send(makeRule()).expect(201);
      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({ name: 'Another rule' }))
        .expect(201);

      const res = await authReq().get(`/projects/${projectKey}/workflow-rules`).expect(200);
      const items = res.body.data?.items ?? res.body.data ?? res.body.items ?? [];
      expect(items.length).toBe(2);
    });
  });

  describe('GET /projects/:key/workflow-rules/:ruleId', () => {
    it('should return rule details', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);
      const ruleId = createRes.body.data.id;

      const res = await authReq()
        .get(`/projects/${projectKey}/workflow-rules/${ruleId}`)
        .expect(200);

      expect(res.body.data.id).toBe(ruleId);
      expect(res.body.data.name).toBe('Auto-assign bugs');
    });

    it('should return 404 for non-existent rule', async () => {
      await authReq()
        .get(`/projects/${projectKey}/workflow-rules/00000000-0000-0000-0000-000000000099`)
        .expect(404);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────

  describe('PATCH /projects/:key/workflow-rules/:ruleId', () => {
    it('should update rule name and conditions', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);
      const ruleId = createRes.body.data.id;

      const res = await authReq()
        .patch(`/projects/${projectKey}/workflow-rules/${ruleId}`)
        .send({ name: 'Updated Rule', conditions: { field: 'priority', op: 'eq', value: 'CRITICAL' } })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Rule');
    });
  });

  // ─── Toggle ───────────────────────────────────────────────────────

  describe('POST /projects/:key/workflow-rules/:ruleId/toggle', () => {
    it('should toggle rule enabled state', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);
      const ruleId = createRes.body.data.id;
      expect(createRes.body.data.isEnabled).toBe(true);

      const toggleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules/${ruleId}/toggle`)
        .expect(200);
      expect(toggleRes.body.data.isEnabled).toBe(false);

      const toggleRes2 = await authReq()
        .post(`/projects/${projectKey}/workflow-rules/${ruleId}/toggle`)
        .expect(200);
      expect(toggleRes2.body.data.isEnabled).toBe(true);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('DELETE /projects/:key/workflow-rules/:ruleId', () => {
    it('should delete a rule', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);
      const ruleId = createRes.body.data.id;

      await authReq()
        .delete(`/projects/${projectKey}/workflow-rules/${ruleId}`)
        .expect(204);

      await authReq()
        .get(`/projects/${projectKey}/workflow-rules/${ruleId}`)
        .expect(404);
    });
  });

  // ─── Test / Dry-run ───────────────────────────────────────────────

  describe('POST /projects/:key/workflow-rules/:ruleId/test', () => {
    it('should dry-run rule against test issue', async () => {
      const createRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);
      const ruleId = createRes.body.data.id;

      // Get an actual statusId from the workflow
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      const statuses = readStatuses(project!.workflows[0]!.statuses);
      const statusId = statuses[0]!.id;

      const testRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules/${ruleId}/test`)
        .send({ issue: { type: 'BUG', priority: 'MEDIUM', statusId } })
        .expect(200);

      expect(testRes.body.data).toBeDefined();
    });
  });

  // ─── Actual Execution ──────────────────────────────────────────────

  describe('Rule Execution on Issue Create', () => {
    it('should execute SET_PRIORITY action when ON_CREATE rule matches', async () => {
      // Conditions use structured format: { field, op, values/value }
      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          name: 'Set BUG priority to URGENT',
          trigger: 'ON_CREATE',
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_PRIORITY', priority: 'CRITICAL' }],
        }))
        .expect(201);

      // Create a BUG issue with LOW priority
      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Bug Report', type: 'BUG', priority: 'LOW' })
        .expect(201);

      // Wait for async rule execution
      await new Promise((r) => setTimeout(r, 1_000));

      // Check that priority was changed to URGENT
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      expect(issue!.priority).toBe('CRITICAL');
    });

    it('should not execute rule when conditions do not match', async () => {
      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_CREATE',
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_PRIORITY', priority: 'CRITICAL' }],
        }))
        .expect(201);

      // Create a TASK (not BUG)
      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Task', type: 'TASK', priority: 'LOW' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 500));

      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      expect(issue!.priority).toBe('LOW');
    });

    it('should not execute disabled rules', async () => {
      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_CREATE',
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_PRIORITY', priority: 'CRITICAL' }],
        }))
        .expect(201);

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules/${ruleRes.body.data.id}/toggle`)
        .expect(200);

      // Create a BUG
      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Bug', type: 'BUG', priority: 'LOW' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 500));

      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      expect(issue!.priority).toBe('LOW');
    });

    it('should record execution in WorkflowRuleExecution table', async () => {
      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_CREATE',
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_PRIORITY', priority: 'CRITICAL' }],
        }))
        .expect(201);

      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Execution Tracking Bug', type: 'BUG', priority: 'LOW' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 1_000));

      const executions = await ctx.prisma.workflowRuleExecution.findMany({
        where: { ruleId: ruleRes.body.data.id },
      });
      expect(executions.length).toBeGreaterThanOrEqual(1);
      expect(executions[0].success).toBe(true);
    });
  });

  // ─── ON_STATUS_CHANGE Execution ────────────────────────────────────

  describe('Rule Execution on Status Change', () => {
    it('should execute SET_PRIORITY when ON_STATUS_CHANGE rule matches', async () => {
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      const statuses = readStatuses(project!.workflows[0]!.statuses);
      const inProgress = statuses.find((s) => s.name === 'In Progress')!;

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_STATUS_CHANGE',
          conditions: { field: 'newStatus', op: 'eq', value: inProgress.id },
          actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
        }))
        .expect(201);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Status change issue', priority: 'LOW' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ statusId: inProgress.id })
        .expect(200);

      let issue: Issue | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        issue = await ctx.prisma.issue.findUnique({
          where: { id: issueRes.body.data.id },
        });
        if (issue?.priority === 'HIGH') break;
      }
      expect(issue!.priority).toBe('HIGH');
    });

    it('should not execute ON_CREATE rules on status change', async () => {
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      const statuses = readStatuses(project!.workflows[0]!.statuses);
      const inProgress = statuses.find((s) => s.name === 'In Progress')!;

      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_CREATE',
          conditions: { field: 'status', op: 'eq', value: inProgress.id },
          actions: [{ type: 'SET_PRIORITY', priority: 'CRITICAL' }],
        }))
        .expect(201);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'No trigger', priority: 'LOW' })
        .expect(201);

      // Wait for any ON_CREATE rule to settle (statusId won't match)
      await new Promise((r) => setTimeout(r, 500));

      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ statusId: inProgress.id })
        .expect(200);

      await new Promise((r) => setTimeout(r, 500));

      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      // The ON_CREATE rule should not re-fire on status change
      expect(issue!.priority).toBe('LOW');

      const executions = await ctx.prisma.workflowRuleExecution.findMany({
        where: { ruleId: ruleRes.body.data.id },
      });
      expect(executions.length).toBe(0);
    });
  });

  // ─── Multi-action / Other Action Types ─────────────────────────────

  describe('Multiple actions and additional action types', () => {
    it('should execute multiple actions in a single rule', async () => {
      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [
            { type: 'SET_PRIORITY', priority: 'CRITICAL' },
            { type: 'SET_TYPE', issueType: 'TASK' },
          ],
        }))
        .expect(201);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Multi-action bug', type: 'BUG', priority: 'LOW' })
        .expect(201);

      let issue: Issue | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        issue = await ctx.prisma.issue.findUnique({
          where: { id: issueRes.body.data.id },
        });
        if (issue?.priority === 'CRITICAL' && issue?.type === 'TASK') break;
      }
      expect(issue!.priority).toBe('CRITICAL');
      expect(issue!.type).toBe('TASK');
    });

    it('should set assignee to trigger user via TRIGGER_USER sentinel', async () => {
      const TRIGGER_USER = '$TRIGGER_USER';

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_ASSIGNEE', userId: TRIGGER_USER }],
        }))
        .expect(201);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Self-assign bug', type: 'BUG' })
        .expect(201);

      const admin = await ctx.prisma.user.findFirst({ where: { email: 'admin@test.local' } });

      let issue: Issue | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        issue = await ctx.prisma.issue.findUnique({
          where: { id: issueRes.body.data.id },
        });
        if (issue?.assigneeId === admin!.id) break;
      }
      expect(issue!.assigneeId).toBe(admin!.id);
    });
  });

  // ─── Executions Endpoint ───────────────────────────────────────────

  describe('GET /projects/:key/workflow-rules/:ruleId/executions', () => {
    it('should return paginated executions for a rule', async () => {
      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          conditions: { field: 'type', op: 'in', values: ['BUG'] },
          actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
        }))
        .expect(201);

      // Create 2 BUG issues to generate executions
      for (let i = 0; i < 2; i++) {
        await authReq()
          .post(`/projects/${projectKey}/issues`)
          .send({ title: `Bug ${i}`, type: 'BUG' })
          .expect(201);
      }

      // Wait for executions to land
      let executions: WorkflowRuleExecution[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        executions = await ctx.prisma.workflowRuleExecution.findMany({
          where: { ruleId: ruleRes.body.data.id },
        });
        if (executions.length >= 2) break;
      }

      const res = await authReq()
        .get(`/projects/${projectKey}/workflow-rules/${ruleRes.body.data.id}/executions`)
        .expect(200);

      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[0]).toHaveProperty('success');
      expect(items[0]).toHaveProperty('duration');
    });

    it('should return empty list for rule with no executions', async () => {
      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(201);

      const res = await authReq()
        .get(`/projects/${projectKey}/workflow-rules/${ruleRes.body.data.id}/executions`)
        .expect(200);

      const items = res.body.data?.items ?? res.body.items ?? [];
      expect(items).toEqual([]);
    });
  });

  // ─── BLOCK_TRANSITION Guards ───────────────────────────────────────

  describe('BLOCK_TRANSITION action', () => {
    async function getStatuses() {
      const project = await ctx.prisma.project.findFirst({
        where: { key: projectKey },
        include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
      });
      return readStatuses(project!.workflows[0]!.statuses);
    }

    it('should block status transition when BLOCK_TRANSITION rule matches', async () => {
      const statuses = await getStatuses();
      const done = statuses.find((s) => s.isResolved)!;

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          name: 'Block BUG → Done without assignee',
          trigger: 'ON_STATUS_CHANGE',
          conditions: {
            and: [
              { field: 'type', op: 'in', values: ['BUG'] },
              { field: 'newStatus', op: 'eq', value: done.id },
              { field: 'assignee', op: 'is_empty' },
            ],
          },
          actions: [{ type: 'BLOCK_TRANSITION', message: 'Bugs require an assignee before closing' }],
        }))
        .expect(201);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Unassigned bug', type: 'BUG' })
        .expect(201);

      const res = await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ statusId: done.id })
        .expect(400);

      expect(res.body.error.message).toContain('assignee');

      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      expect(issue!.statusId).not.toBe(done.id);
    });

    it('should allow transition when BLOCK_TRANSITION conditions do not match', async () => {
      const statuses = await getStatuses();
      const done = statuses.find((s) => s.isResolved)!;

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          name: 'Block BUG → Done',
          trigger: 'ON_STATUS_CHANGE',
          conditions: {
            and: [
              { field: 'type', op: 'in', values: ['BUG'] },
              { field: 'newStatus', op: 'eq', value: done.id },
            ],
          },
          actions: [{ type: 'BLOCK_TRANSITION', message: 'No' }],
        }))
        .expect(201);

      // Create a TASK (not BUG) — condition doesn't match, transition allowed
      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Some task', type: 'TASK' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ statusId: done.id })
        .expect(200);

      const issue = await ctx.prisma.issue.findUnique({
        where: { id: issueRes.body.data.id },
      });
      expect(issue!.statusId).toBe(done.id);
    });

    it('should not block when rule is disabled', async () => {
      const statuses = await getStatuses();
      const done = statuses.find((s) => s.isResolved)!;

      const ruleRes = await authReq()
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule({
          trigger: 'ON_STATUS_CHANGE',
          conditions: { field: 'newStatus', op: 'eq', value: done.id },
          actions: [{ type: 'BLOCK_TRANSITION', message: 'Disabled' }],
        }))
        .expect(201);

      await authReq()
        .post(`/projects/${projectKey}/workflow-rules/${ruleRes.body.data.id}/toggle`)
        .expect(200);

      const issueRes = await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: 'Task', type: 'TASK' })
        .expect(201);

      await authReq()
        .patch(`/projects/${projectKey}/issues/${issueRes.body.data.number}`)
        .send({ statusId: done.id })
        .expect(200);
    });
  });

  // ─── Authorization ─────────────────────────────────────────────────

  describe('authorization', () => {
    it('should reject non-admin without WORKFLOW_RULE_MANAGE from creating rules', async () => {
      const hash = await bcrypt.hash('userpass1', 4);
      await ctx.prisma.user.create({
        data: {
          email: 'observer@test.local',
          name: 'Observer',
          passwordHash: hash,
          hasPassword: true,
          role: 'USER',
        },
      });
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'observer@test.local', password: 'userpass1' })
        .expect(200);
      const userToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

      const user = await ctx.prisma.user.findFirst({ where: { email: 'observer@test.local' } });
      // Observer role (...0005) has only ISSUE_READ + ARTICLE_READ
      await authReq()
        .post(`/projects/${projectKey}/members`)
        .send({ userId: user!.id, roleId: '00000000-0000-0000-0000-000000000005' })
        .expect(201);

      await authReq(userToken)
        .post(`/projects/${projectKey}/workflow-rules`)
        .send(makeRule())
        .expect(403);
    });
  });
});
