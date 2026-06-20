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

describe('Boards Integration — autoCloseOnDone', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let boardId: string;
  let doneStatusId: string;
  let startedStatusId: string;
  let openStatusId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    // Seed admin user
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

    // Create a project
    projectKey = 'BRD';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Board Test Project' })
      .expect(201);

    // Create a board (autoCloseOnDone defaults to true)
    const boardRes = await authReq()
      .post(`/projects/${projectKey}/boards`)
      .send({ name: 'Test Board' })
      .expect(201);
    boardId = boardRes.body.data.id;

    // Get workflow statuses
    const project = await ctx.prisma.project.findFirst({
      where: { key: projectKey },
      include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
    });
    const statuses = project!.workflows[0]!.statuses as Array<{
      id: string;
      name: string;
      category: string;
    }>;

    openStatusId = statuses.find((s) => s.category === 'UNSTARTED')!.id;
    startedStatusId = statuses.find((s) => s.category === 'STARTED')!.id;
    doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
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
    };
  }

  async function createIssue(title: string, overrides?: Record<string, unknown>) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title, type: 'TASK', ...overrides })
      .expect(201);
    return res.body.data;
  }

  async function getIssueFromDb(issueId: string) {
    return ctx.prisma.issue.findUnique({ where: { id: issueId } });
  }

  function moveIssue(issueId: string, toStatusId: string) {
    return authReq()
      .post(`/projects/${projectKey}/boards/${boardId}/issues/move`)
      .send({ issueId, toStatusId });
  }

  it('should auto-close parent when all children move to DONE', async () => {
    // Create parent (Story) and two child tasks
    const parent = await createIssue('Parent Story', { type: 'STORY' });
    const child1 = await createIssue('Child Task 1', { parentId: parent.id });
    const child2 = await createIssue('Child Task 2', { parentId: parent.id });

    // Move child1 to DONE — parent should NOT close yet (child2 still open)
    await moveIssue(child1.id, doneStatusId).expect(200);

    const parentAfterFirst = await getIssueFromDb(parent.id);
    expect(parentAfterFirst!.statusId).toBe(openStatusId);
    expect(parentAfterFirst!.resolvedAt).toBeNull();

    // Move child2 to DONE — all children done → parent should auto-close
    await moveIssue(child2.id, doneStatusId).expect(200);

    const parentAfterAll = await getIssueFromDb(parent.id);
    expect(parentAfterAll!.statusId).toBe(doneStatusId);
    expect(parentAfterAll!.resolvedAt).not.toBeNull();
  });

  it('should auto-reopen parent when a child moves out of DONE', async () => {
    const parent = await createIssue('Parent Story', { type: 'STORY' });
    const child1 = await createIssue('Child 1', { parentId: parent.id });
    const child2 = await createIssue('Child 2', { parentId: parent.id });

    // Close both children → parent auto-closes
    await moveIssue(child1.id, doneStatusId).expect(200);
    await moveIssue(child2.id, doneStatusId).expect(200);

    const parentClosed = await getIssueFromDb(parent.id);
    expect(parentClosed!.statusId).toBe(doneStatusId);

    // Reopen child1 → parent should auto-reopen
    await moveIssue(child1.id, startedStatusId).expect(200);

    const parentReopened = await getIssueFromDb(parent.id);
    expect(parentReopened!.statusId).toBe(startedStatusId);
    expect(parentReopened!.resolvedAt).toBeNull();
  });

  it('should NOT auto-close when autoCloseOnDone is disabled', async () => {
    // Disable autoCloseOnDone on the board
    await authReq()
      .patch(`/projects/${projectKey}/boards/${boardId}`)
      .send({ autoCloseOnDone: false })
      .expect(200);

    const parent = await createIssue('Parent', { type: 'STORY' });
    const child = await createIssue('Only Child', { parentId: parent.id });

    // Move child to DONE — parent should stay open
    await moveIssue(child.id, doneStatusId).expect(200);

    const parentAfter = await getIssueFromDb(parent.id);
    expect(parentAfter!.statusId).toBe(openStatusId);
    expect(parentAfter!.resolvedAt).toBeNull();
  });

  it('should cascade up multiple levels', async () => {
    // Grandparent → Parent → Child
    const grandparent = await createIssue('Epic', { type: 'EPIC' });
    const parent = await createIssue('Story', { type: 'STORY', parentId: grandparent.id });
    const child = await createIssue('Task', { parentId: parent.id });

    // Move child to DONE → parent closes → grandparent closes
    await moveIssue(child.id, doneStatusId).expect(200);

    const parentAfter = await getIssueFromDb(parent.id);
    expect(parentAfter!.statusId).toBe(doneStatusId);

    const grandparentAfter = await getIssueFromDb(grandparent.id);
    expect(grandparentAfter!.statusId).toBe(doneStatusId);
  });

  it('should record auto-transition activities', async () => {
    const parent = await createIssue('Parent', { type: 'STORY' });
    const child = await createIssue('Child', { parentId: parent.id });

    await moveIssue(child.id, doneStatusId).expect(200);

    // Check that an activity was recorded for the parent auto-transition
    const activities = await ctx.prisma.activity.findMany({
      where: { issueId: parent.id, type: 'STATUS_CHANGE' },
    });

    expect(activities.length).toBe(1);
    const payload = activities[0]!.payload as { to: string; auto: boolean };
    expect(payload.to).toBe(doneStatusId);
    expect(payload.auto).toBe(true);
  });
});
