import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Workflows Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let defaultWorkflowId: string;

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

    projectKey = 'WF';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Workflow Project' })
      .expect(201);

    // Get the default workflow
    const wfRes = await authReq()
      .get(`/projects/${projectKey}/workflows`)
      .expect(200);
    defaultWorkflowId = wfRes.body.data[0].id;
  });

  function authReq() {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      put: (url: string) =>
        request(ctx.app.getHttpServer())
          .put(url)
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

  function wfUrl(id?: string) {
    const base = `/projects/${projectKey}/workflows`;
    return id ? `${base}/${id}` : base;
  }

  function makeStatus(
    name: string,
    category: string,
    opts?: { isInitial?: boolean; isResolved?: boolean; ordinal?: number },
  ) {
    return {
      name,
      color: '#888888',
      category,
      isInitial: opts?.isInitial ?? false,
      isResolved: opts?.isResolved ?? false,
      ordinal: opts?.ordinal ?? 0,
    };
  }

  it('should list workflows (project has default workflow)', async () => {
    const res = await authReq().get(wfUrl()).expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].isDefault).toBe(true);
  });

  it('should create a custom workflow', async () => {
    const res = await authReq()
      .post(wfUrl())
      .send({
        name: 'Custom Flow',
        statuses: [
          makeStatus('New', 'UNSTARTED', { isInitial: true, ordinal: 0 }),
          makeStatus('Done', 'DONE', { isResolved: true, ordinal: 1 }),
        ],
        transitions: [],
      })
      .expect(201);

    expect(res.body.data.name).toBe('Custom Flow');
    expect(res.body.data.isDefault).toBe(false);
  });

  it('should reject workflow without initial status', async () => {
    await authReq()
      .post(wfUrl())
      .send({
        name: 'Bad Flow',
        statuses: [
          makeStatus('Done', 'DONE', { isResolved: true }),
        ],
        transitions: [],
      })
      .expect(400);
  });

  it('should set a workflow as default', async () => {
    const createRes = await authReq()
      .post(wfUrl())
      .send({
        name: 'New Default',
        statuses: [
          makeStatus('Open', 'UNSTARTED', { isInitial: true }),
          makeStatus('Closed', 'DONE', { isResolved: true, ordinal: 1 }),
        ],
        transitions: [],
      })
      .expect(201);

    await authReq()
      .patch(wfUrl(createRes.body.data.id) + '/default')
      .expect(200);

    // Verify old default is no longer default
    const oldWf = await ctx.prisma.workflow.findUnique({
      where: { id: defaultWorkflowId },
    });
    expect(oldWf!.isDefault).toBe(false);
  });

  it('should reject deleting the default workflow', async () => {
    await authReq()
      .delete(wfUrl(defaultWorkflowId))
      .expect(400);
  });

  it('should delete a non-default workflow', async () => {
    const createRes = await authReq()
      .post(wfUrl())
      .send({
        name: 'Deletable',
        statuses: [
          makeStatus('Open', 'UNSTARTED', { isInitial: true }),
          makeStatus('Done', 'DONE', { isResolved: true, ordinal: 1 }),
        ],
        transitions: [],
      })
      .expect(201);

    await authReq()
      .delete(wfUrl(createRes.body.data.id))
      .expect(204);
  });

  it('round-trips a wildcard transition (* ⇄ NULL)', async () => {
    const createRes = await authReq()
      .post(wfUrl())
      .send({
        name: 'Wildcard Flow',
        statuses: [
          makeStatus('Open', 'UNSTARTED', { isInitial: true, ordinal: 0 }),
          makeStatus('Done', 'DONE', { isResolved: true, ordinal: 1 }),
        ],
        transitions: [],
      })
      .expect(201);

    const wfId = createRes.body.data.id;
    const doneId = createRes.body.data.statuses.find(
      (s: { category: string }) => s.category === 'DONE',
    ).id;

    const updateRes = await authReq()
      .put(wfUrl(wfId))
      .send({
        name: 'Wildcard Flow',
        statuses: createRes.body.data.statuses,
        transitions: [
          {
            id: randomUUID(),
            name: 'Finish',
            fromStatusId: '*',
            toStatusId: doneId,
            requiredRole: null,
          },
        ],
      })
      .expect(200);

    expect(updateRes.body.data.transitions).toHaveLength(1);
    expect(updateRes.body.data.transitions[0].fromStatusId).toBe('*');

    // Stored as NULL at the DB level.
    const row = await ctx.prisma.workflowTransition.findFirst({
      where: { workflowId: wfId },
    });
    expect(row!.fromStatusId).toBeNull();
  });

  it('remaps issues then deletes the status when a mapping is provided', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Remap Me', type: 'TASK' })
      .expect(201);

    const wfRes = await authReq().get(wfUrl(defaultWorkflowId)).expect(200);
    const statuses = wfRes.body.data.statuses as Array<{
      id: string;
      isInitial: boolean;
    }>;
    const initial = statuses.find((s) => s.isInitial)!;
    const target = statuses.find((s) => !s.isInitial)!;

    // Remove the initial status, remapping its issues onto another (now initial).
    const remaining = statuses
      .filter((s) => s.id !== initial.id)
      .map((s) => ({ ...s, isInitial: s.id === target.id }));

    await authReq()
      .put(wfUrl(defaultWorkflowId))
      .send({
        name: wfRes.body.data.name,
        statuses: remaining,
        transitions: [],
        migrateStatusMapping: { [initial.id]: target.id },
      })
      .expect(200);

    // The old status row is gone…
    const goneStatus = await ctx.prisma.workflowStatus.findUnique({
      where: { id: initial.id },
    });
    expect(goneStatus).toBeNull();

    // …and the issue moved to the target status.
    const issue = await ctx.prisma.issue.findFirst({
      where: { project: { key: projectKey } },
    });
    expect(issue!.statusId).toBe(target.id);
  });

  it('enforces the Issue.status FK at the DB level (RESTRICT)', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'FK Guard', type: 'TASK' })
      .expect(201);

    const issue = await ctx.prisma.issue.findFirstOrThrow({
      where: { project: { key: projectKey } },
    });

    await expect(
      ctx.prisma.workflowStatus.delete({ where: { id: issue.statusId } }),
    ).rejects.toThrow();
  });

  it('should reject removing a status used by issues', async () => {
    // Create an issue (uses default workflow's initial status)
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Test Issue', type: 'TASK' })
      .expect(201);

    // Get the current workflow statuses
    const wfRes = await authReq().get(wfUrl(defaultWorkflowId)).expect(200);
    const statuses = wfRes.body.data.statuses;

    // Try to update removing the initial (used) status
    const statusesWithoutInitial = statuses.filter(
      (s: { isInitial: boolean }) => !s.isInitial,
    );
    // Make one of remaining isInitial
    if (statusesWithoutInitial.length > 0) {
      statusesWithoutInitial[0].isInitial = true;
    }

    const res = await authReq()
      .put(wfUrl(defaultWorkflowId))
      .send({
        name: wfRes.body.data.name,
        statuses: statusesWithoutInitial,
        transitions: wfRes.body.data.transitions ?? [],
      });

    expect(res.status).toBe(409);
  });
});
