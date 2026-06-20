import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { SprintStatus } from '@prisma/client';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Sprints Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let boardId: string;
  let doneStatusId: string;
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

    projectKey = 'SPR';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Sprint Test Project' })
      .expect(201);

    // Create a SCRUM board
    const boardRes = await authReq()
      .post(`/projects/${projectKey}/boards`)
      .send({ name: 'Scrum Board', type: 'SCRUM' })
      .expect(201);
    boardId = boardRes.body.data.id;

    // Resolve workflow statuses
    const project = await ctx.prisma.project.findFirst({
      where: { key: projectKey },
      include: { workflows: { include: { statuses: { orderBy: { ordinal: 'asc' } } } } },
    });
    const statuses = project!.workflows[0].statuses as Array<{
      id: string;
      name: string;
      category: string;
    }>;
    openStatusId = statuses.find((s) => s.category === 'UNSTARTED')!.id;
    doneStatusId = statuses.find((s) => s.category === 'DONE')!.id;
  });

  // ─── Helpers ────────────────────────────────────────────────

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

  function sprintUrl(sprintId?: string) {
    const base = `/boards/${boardId}/sprints`;
    return sprintId ? `${base}/${sprintId}` : base;
  }

  async function createSprint(name: string, overrides?: Record<string, unknown>) {
    const res = await authReq()
      .post(sprintUrl())
      .send({ name, ...overrides })
      .expect(201);
    return res.body.data;
  }

  async function createIssue(title: string, overrides?: Record<string, unknown>) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title, type: 'TASK', ...overrides })
      .expect(201);
    return res.body.data;
  }

  async function addIssuesToSprint(sprintId: string, issueIds: string[]) {
    return authReq()
      .post(sprintUrl(sprintId) + '/issues')
      .send({ issueIds })
      .expect(200);
  }

  function startSprint(sprintId: string, body?: Record<string, unknown>) {
    return authReq()
      .post(sprintUrl(sprintId) + '/start')
      .send(body ?? {});
  }

  function closeSprint(sprintId: string, body: Record<string, unknown>) {
    return authReq()
      .post(sprintUrl(sprintId) + '/close')
      .send(body);
  }

  // ─── CRUD ───────────────────────────────────────────────────

  describe('CRUD', () => {
    it('should create a sprint in PLANNING status', async () => {
      const sprint = await createSprint('Sprint 1', {
        goal: 'Deliver feature X',
      });

      expect(sprint.name).toBe('Sprint 1');
      expect(sprint.goal).toBe('Deliver feature X');
      expect(sprint.status).toBe(SprintStatus.PLANNING);
      expect(sprint.boardId).toBe(boardId);
    });

    it('should list sprints with pagination', async () => {
      await createSprint('Sprint 1');
      await createSprint('Sprint 2');
      await createSprint('Sprint 3');

      const res = await authReq()
        .get(sprintUrl() + '?page=1&perPage=2')
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('should filter sprints by status', async () => {
      await createSprint('Planning Sprint');

      const res = await authReq()
        .get(sprintUrl() + '?status=PLANNING')
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].status).toBe(SprintStatus.PLANNING);

      const activeRes = await authReq()
        .get(sprintUrl() + '?status=ACTIVE')
        .expect(200);

      expect(activeRes.body.items).toHaveLength(0);
    });

    it('should get a single sprint by id', async () => {
      const sprint = await createSprint('My Sprint');

      const res = await authReq()
        .get(sprintUrl(sprint.id))
        .expect(200);

      expect(res.body.data.id).toBe(sprint.id);
      expect(res.body.data.name).toBe('My Sprint');
    });

    it('should update a PLANNING sprint', async () => {
      const sprint = await createSprint('Old Name');

      const res = await authReq()
        .patch(sprintUrl(sprint.id))
        .send({ name: 'New Name', goal: 'Updated goal' })
        .expect(200);

      expect(res.body.data.name).toBe('New Name');
      expect(res.body.data.goal).toBe('Updated goal');
    });

    it('should delete a PLANNING sprint and unassign its issues', async () => {
      const sprint = await createSprint('Doomed Sprint');
      const issue = await createIssue('Some Task');
      await addIssuesToSprint(sprint.id, [issue.id]);

      await authReq()
        .delete(sprintUrl(sprint.id))
        .expect(204);

      // Sprint deleted
      const dbSprint = await ctx.prisma.sprint.findUnique({
        where: { id: sprint.id },
      });
      expect(dbSprint).toBeNull();

      // Issue unassigned from sprint
      const dbIssue = await ctx.prisma.issue.findUnique({
        where: { id: issue.id },
      });
      expect(dbIssue!.sprintId).toBeNull();
    });

    it('should assign ascending ordinals to sprints', async () => {
      const s1 = await createSprint('Sprint 1');
      const s2 = await createSprint('Sprint 2');
      const s3 = await createSprint('Sprint 3');

      expect(s1.ordinal).toBe(0);
      expect(s2.ordinal).toBe(1);
      expect(s3.ordinal).toBe(2);
    });
  });

  // ─── Lifecycle: Start ───────────────────────────────────────

  describe('Start sprint', () => {
    it('should start a PLANNING sprint that has issues', async () => {
      const sprint = await createSprint('Sprint 1');
      const issue = await createIssue('Task 1');
      await addIssuesToSprint(sprint.id, [issue.id]);

      const res = await startSprint(sprint.id);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(SprintStatus.ACTIVE);
      expect(res.body.data.startedAt).toBeTruthy();
      expect(res.body.data.totalIssues).toBe(1);
    });

    it('should reject starting an empty sprint', async () => {
      const sprint = await createSprint('Empty Sprint');

      const res = await startSprint(sprint.id);
      expect(res.status).toBe(400);
    });

    it('should reject starting when another sprint is already active', async () => {
      // Start first sprint
      const sprint1 = await createSprint('Sprint 1');
      const issue1 = await createIssue('Task 1');
      await addIssuesToSprint(sprint1.id, [issue1.id]);
      await startSprint(sprint1.id).expect(200);

      // Try starting second sprint
      const sprint2 = await createSprint('Sprint 2');
      const issue2 = await createIssue('Task 2');
      await addIssuesToSprint(sprint2.id, [issue2.id]);

      const res = await startSprint(sprint2.id);
      expect(res.status).toBe(400);
    });

    it('should reject starting a non-PLANNING sprint', async () => {
      const sprint = await createSprint('Sprint 1');
      const issue = await createIssue('Task 1');
      await addIssuesToSprint(sprint.id, [issue.id]);
      await startSprint(sprint.id).expect(200);

      // Try starting already-active sprint
      const res = await startSprint(sprint.id);
      expect(res.status).toBe(400);
    });

    it('should accept start/end date overrides', async () => {
      const sprint = await createSprint('Sprint 1');
      const issue = await createIssue('Task 1');
      await addIssuesToSprint(sprint.id, [issue.id]);

      const startDate = '2026-04-01T00:00:00.000Z';
      const endDate = '2026-04-14T00:00:00.000Z';

      const res = await startSprint(sprint.id, { startDate, endDate });
      expect(res.status).toBe(200);
      expect(res.body.data.startDate).toBe(startDate);
      expect(res.body.data.endDate).toBe(endDate);
    });
  });

  // ─── Lifecycle: Close ───────────────────────────────────────

  describe('Close sprint', () => {
    let activeSprint: { id: string };

    beforeEach(async () => {
      activeSprint = await createSprint('Active Sprint');
    });

    async function makeSprintActive(
      sprintId: string,
      issueCount: number,
      resolvedCount = 0,
    ) {
      const issueIds: string[] = [];
      for (let i = 0; i < issueCount; i++) {
        const issue = await createIssue(`Task ${i + 1}`);
        issueIds.push(issue.id);
      }

      await addIssuesToSprint(sprintId, issueIds);
      await startSprint(sprintId).expect(200);

      // Resolve some issues by moving to DONE status
      for (let i = 0; i < resolvedCount; i++) {
        await authReq()
          .post(`/projects/${projectKey}/boards/${boardId}/issues/move`)
          .send({ issueId: issueIds[i], toStatusId: doneStatusId })
          .expect(200);
      }

      return issueIds;
    }

    it('should close an active sprint and move incomplete issues to backlog', async () => {
      const issueIds = await makeSprintActive(activeSprint.id, 3, 1);

      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_BACKLOG',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.sprint.status).toBe(SprintStatus.CLOSED);
      expect(res.body.data.completedIssues).toBe(1);
      expect(res.body.data.incompleteIssues).toBe(2);
      expect(res.body.data.movedToBacklog).toBe(2);

      // Verify incomplete issues have sprintId = null
      const backlogIssues = await ctx.prisma.issue.findMany({
        where: { id: { in: issueIds.slice(1) }, sprintId: null },
      });
      expect(backlogIssues).toHaveLength(2);
    });

    it('should close and move incomplete issues to next sprint', async () => {
      const issueIds = await makeSprintActive(activeSprint.id, 3, 1);

      const nextSprint = await createSprint('Next Sprint');

      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_NEXT_SPRINT',
        nextSprintId: nextSprint.id,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.movedToSprint).toBe(2);

      // Verify incomplete issues moved to next sprint
      const movedIssues = await ctx.prisma.issue.findMany({
        where: { id: { in: issueIds.slice(1) }, sprintId: nextSprint.id },
      });
      expect(movedIssues).toHaveLength(2);

      // Verify next sprint counters updated
      const nextSprintDb = await ctx.prisma.sprint.findUnique({
        where: { id: nextSprint.id },
      });
      expect(nextSprintDb!.totalIssues).toBe(2);
      expect(nextSprintDb!.completedIssues).toBe(0);
    });

    it('should reject closing a PLANNING sprint', async () => {
      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_BACKLOG',
      });

      expect(res.status).toBe(400);
    });

    it('should reject MOVE_TO_NEXT_SPRINT without nextSprintId', async () => {
      await makeSprintActive(activeSprint.id, 2, 0);

      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_NEXT_SPRINT',
      });

      expect(res.status).toBe(400);
    });

    it('should reject moving issues to a closed sprint', async () => {
      await makeSprintActive(activeSprint.id, 2, 0);

      // Create and close another sprint
      const otherSprint = await createSprint('Other');

      // Manually close the other sprint in DB
      await ctx.prisma.sprint.update({
        where: { id: otherSprint.id },
        data: { status: SprintStatus.CLOSED, closedAt: new Date() },
      });

      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_NEXT_SPRINT',
        nextSprintId: otherSprint.id,
      });

      expect(res.status).toBe(400);
    });

    it('should calculate velocity points from completed issue estimates', async () => {
      const i1 = await createIssue('Estimated Task', { estimate: 5 });
      const i2 = await createIssue('Another Estimated', { estimate: 3 });
      const i3 = await createIssue('Incomplete Task', { estimate: 8 });

      await addIssuesToSprint(activeSprint.id, [i1.id, i2.id, i3.id]);
      await startSprint(activeSprint.id).expect(200);

      // Resolve the first two
      await authReq()
        .post(`/projects/${projectKey}/boards/${boardId}/issues/move`)
        .send({ issueId: i1.id, toStatusId: doneStatusId })
        .expect(200);
      await authReq()
        .post(`/projects/${projectKey}/boards/${boardId}/issues/move`)
        .send({ issueId: i2.id, toStatusId: doneStatusId })
        .expect(200);

      const res = await closeSprint(activeSprint.id, {
        incompleteIssuesAction: 'MOVE_TO_BACKLOG',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.velocityPoints).toBe(8); // 5 + 3
    });
  });

  // ─── Issue Management ───────────────────────────────────────

  describe('Add/Remove issues', () => {
    it('should add issues to a sprint and update counters', async () => {
      const sprint = await createSprint('Sprint 1');
      const i1 = await createIssue('Task 1');
      const i2 = await createIssue('Task 2');

      const res = await addIssuesToSprint(sprint.id, [i1.id, i2.id]);
      expect(res.body.data.added).toBe(2);

      const dbSprint = await ctx.prisma.sprint.findUnique({
        where: { id: sprint.id },
      });
      expect(dbSprint!.totalIssues).toBe(2);
      expect(dbSprint!.completedIssues).toBe(0);
    });

    it('should remove issues from a sprint and update counters', async () => {
      const sprint = await createSprint('Sprint 1');
      const i1 = await createIssue('Task 1');
      const i2 = await createIssue('Task 2');
      await addIssuesToSprint(sprint.id, [i1.id, i2.id]);

      const res = await authReq()
        .delete(sprintUrl(sprint.id) + '/issues')
        .send({ issueIds: [i1.id] })
        .expect(200);

      expect(res.body.data.removed).toBe(1);

      const dbSprint = await ctx.prisma.sprint.findUnique({
        where: { id: sprint.id },
      });
      expect(dbSprint!.totalIssues).toBe(1);
    });

    it('should reject adding issues to a closed sprint', async () => {
      const sprint = await createSprint('Sprint');
      const issue = await createIssue('Task');
      await addIssuesToSprint(sprint.id, [issue.id]);
      await startSprint(sprint.id).expect(200);

      // Close it
      await closeSprint(sprint.id, {
        incompleteIssuesAction: 'MOVE_TO_BACKLOG',
      }).expect(200);

      // Try adding issues
      const newIssue = await createIssue('New Task');
      const res = await authReq()
        .post(sprintUrl(sprint.id) + '/issues')
        .send({ issueIds: [newIssue.id] });

      expect(res.status).toBe(400);
    });
  });

  // ─── Guards ─────────────────────────────────────────────────

  describe('Guards', () => {
    it('should reject editing a closed sprint', async () => {
      const sprint = await createSprint('Sprint');
      const issue = await createIssue('Task');
      await addIssuesToSprint(sprint.id, [issue.id]);
      await startSprint(sprint.id).expect(200);
      await closeSprint(sprint.id, {
        incompleteIssuesAction: 'MOVE_TO_BACKLOG',
      }).expect(200);

      const res = await authReq()
        .patch(sprintUrl(sprint.id))
        .send({ name: 'Renamed' });

      expect(res.status).toBe(400);
    });

    it('should reject deleting a non-PLANNING sprint', async () => {
      const sprint = await createSprint('Sprint');
      const issue = await createIssue('Task');
      await addIssuesToSprint(sprint.id, [issue.id]);
      await startSprint(sprint.id).expect(200);

      const res = await authReq().delete(sprintUrl(sprint.id));
      expect(res.status).toBe(400);
    });

    it('should reject creating a sprint on a non-SCRUM board', async () => {
      // Create a KANBAN board
      const kanbanRes = await authReq()
        .post(`/projects/${projectKey}/boards`)
        .send({ name: 'Kanban Board', type: 'KANBAN' })
        .expect(201);
      const kanbanBoardId = kanbanRes.body.data.id;

      const res = await authReq()
        .post(`/boards/${kanbanBoardId}/sprints`)
        .send({ name: 'Bad Sprint' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Backlog filtering ──────────────────────────────────────

  describe('Backlog excludes resolved issues', () => {
    async function resolveIssue(issueId: string) {
      await authReq()
        .post(`/projects/${projectKey}/boards/${boardId}/issues/move`)
        .send({ issueId, toStatusId: doneStatusId })
        .expect(200);
    }

    describe('GET backlog-issues (BacklogPanel endpoint)', () => {
      it('should not include resolved issues', async () => {
        const open = await createIssue('Open Task');
        const resolved = await createIssue('Done Task');

        // Resolve the second issue (it has no sprint — resolvedAt set via status change)
        const sprint = await createSprint('Temp');
        await addIssuesToSprint(sprint.id, [resolved.id]);
        await (async () => {
          await authReq()
            .post(`/boards/${boardId}/sprints/${sprint.id}/start`)
            .send({})
            .expect(200);
        })();
        await resolveIssue(resolved.id);
        // Remove from sprint → backlog
        await authReq()
          .delete(sprintUrl(sprint.id) + '/issues')
          .send({ issueIds: [resolved.id] })
          .expect(200);

        const res = await authReq()
          .get(`/boards/${boardId}/sprints/backlog-issues`)
          .expect(200);

        const ids = res.body.items.map((i: { id: string }) => i.id);
        expect(ids).toContain(open.id);
        expect(ids).not.toContain(resolved.id);
      });

      it('should include unresolved issue removed from sprint', async () => {
        const issue = await createIssue('In Review Task');
        const sprint = await createSprint('Sprint A');
        await addIssuesToSprint(sprint.id, [issue.id]);

        // Remove without resolving → goes to backlog with original status
        await authReq()
          .delete(sprintUrl(sprint.id) + '/issues')
          .send({ issueIds: [issue.id] })
          .expect(200);

        const res = await authReq()
          .get(`/boards/${boardId}/sprints/backlog-issues`)
          .expect(200);

        const found = res.body.items.find(
          (i: { id: string; statusId: string }) => i.id === issue.id,
        );
        expect(found).toBeDefined();
        // Status must be preserved — default UNSTARTED status, not reset to something else
        expect(found!.statusId).toBe(openStatusId);
      });
    });

    describe('GET backlog (Sprint planning view)', () => {
      it('should not include resolved issues in backlog section', async () => {
        const open = await createIssue('Open');
        const resolved = await createIssue('Resolved');

        const sprint = await createSprint('Sprint B');
        await addIssuesToSprint(sprint.id, [open.id, resolved.id]);
        await authReq()
          .post(`/boards/${boardId}/sprints/${sprint.id}/start`)
          .send({})
          .expect(200);
        await resolveIssue(resolved.id);

        // Close sprint → incomplete (open) moves to backlog, resolved stays in closed sprint
        await closeSprint(sprint.id, { incompleteIssuesAction: 'MOVE_TO_BACKLOG' }).expect(200);

        const res = await authReq()
          .get(`/boards/${boardId}/sprints/backlog`)
          .expect(200);

        const backlogIds = res.body.data.backlog.issues.map(
          (i: { id: string }) => i.id,
        );
        expect(backlogIds).toContain(open.id);
        expect(backlogIds).not.toContain(resolved.id);
      });

      it('should not include resolved issues manually moved to backlog', async () => {
        const issue = await createIssue('Will Be Resolved');
        const sprint = await createSprint('Sprint C');
        await addIssuesToSprint(sprint.id, [issue.id]);
        await authReq()
          .post(`/boards/${boardId}/sprints/${sprint.id}/start`)
          .send({})
          .expect(200);
        await resolveIssue(issue.id);

        // Manually remove resolved issue from active sprint
        await authReq()
          .delete(sprintUrl(sprint.id) + '/issues')
          .send({ issueIds: [issue.id] })
          .expect(200);

        const res = await authReq()
          .get(`/boards/${boardId}/sprints/backlog`)
          .expect(200);

        const backlogIds = res.body.data.backlog.issues.map(
          (i: { id: string }) => i.id,
        );
        expect(backlogIds).not.toContain(issue.id);
      });
    });
  });
});
