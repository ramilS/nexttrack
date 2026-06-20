import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

test.describe('API Boundary: Sprint Lifecycle', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
  });

  test('list boards for project', async () => {
    const res = await fetch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/boards`),
      { headers: authHeaders(adminToken) },
    );
    expect(res.ok).toBeTruthy();
    const boards = await res.json();
    const boardList = Array.isArray(boards) ? boards : boards.data ?? boards;
    expect(boardList.length).toBeGreaterThanOrEqual(1);
  });

  test('sprint CRUD lifecycle', async () => {
    const headers = { ...authHeaders(adminToken), 'Content-Type': 'application/json' };

    // Get boards
    const boardsRes = await fetch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/boards`),
      { headers: authHeaders(adminToken) },
    );
    const boards = await boardsRes.json();
    const boardList = Array.isArray(boards) ? boards : boards.data ?? boards;
    const scrumBoard = boardList.find((b: any) => b.type === 'SCRUM');
    // The seed creates a SCRUM board for this project — assert, don't skip.
    expect(scrumBoard, 'seed should create a SCRUM board').toBeDefined();

    // Close any existing active sprint
    const sprintsRes = await fetch(
      apiUrl(`/boards/${scrumBoard.id}/sprints`),
      { headers: authHeaders(adminToken) },
    );
    if (sprintsRes.ok) {
      const sprintsBody = await sprintsRes.json();
      const sprints = sprintsBody.items ?? (Array.isArray(sprintsBody) ? sprintsBody : []);
      const activeSprint = sprints.find((s: any) => s.status === 'ACTIVE');
      if (activeSprint) {
        await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints/${activeSprint.id}/close`), {
          method: 'POST', headers,
          body: JSON.stringify({ incompleteIssuesAction: 'MOVE_TO_BACKLOG' }),
        });
      }
    }

    // Create sprint
    const createRes = await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints`), {
      method: 'POST', headers,
      body: JSON.stringify({ name: `E2E Sprint ${Date.now()}`, goal: 'Test sprint lifecycle' }),
    });
    expect(createRes.ok).toBeTruthy();
    const sprintBody = await createRes.json();
    const sprint = sprintBody.data ?? sprintBody;
    expect(sprint.id).toBeTruthy();
    expect(sprint.status).toBe('PLANNING');

    // Add an issue to the sprint so it can be started
    const issuesRes = await fetch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues?perPage=1`),
      { headers: authHeaders(adminToken) },
    );
    if (issuesRes.ok) {
      const issuesBody = await issuesRes.json();
      const issues = issuesBody.data?.items ?? issuesBody.items ?? [];
      if (issues.length > 0) {
        await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints/${sprint.id}/issues`), {
          method: 'POST', headers,
          body: JSON.stringify({ issueIds: [issues[0].id] }),
        });
      }
    }

    // Start sprint
    const startRes = await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints/${sprint.id}/start`), {
      method: 'POST', headers,
      body: JSON.stringify({}),
    });
    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Sprint start failed (${startRes.status}): ${err}`);
    }

    // Close sprint
    const closeRes = await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints/${sprint.id}/close`), {
      method: 'POST', headers,
      body: JSON.stringify({ incompleteIssuesAction: 'MOVE_TO_BACKLOG' }),
    });
    expect(closeRes.ok).toBeTruthy();
    const closedBody = await closeRes.json();
    const closed = closedBody.data ?? closedBody;
    expect(closed.sprint?.status ?? closed.status).toBe('CLOSED');
  });

  test('cannot close a PLANNING sprint', async () => {
    const headers = { ...authHeaders(adminToken), 'Content-Type': 'application/json' };

    const boardsRes = await fetch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/boards`),
      { headers: authHeaders(adminToken) },
    );
    const boards = await boardsRes.json();
    const boardList = Array.isArray(boards) ? boards : boards.data ?? boards;
    const scrumBoard = boardList.find((b: any) => b.type === 'SCRUM');
    // The seed creates a SCRUM board for this project — assert, don't skip.
    expect(scrumBoard, 'seed should create a SCRUM board').toBeDefined();

    // Create a sprint but don't start it
    const createRes = await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints`), {
      method: 'POST', headers,
      body: JSON.stringify({ name: `E2E Skip Sprint ${Date.now()}` }),
    });
    const sprintBody = await createRes.json();
    const sprint = sprintBody.data ?? sprintBody;

    // Try to close PLANNING sprint — should fail with 400
    const closeRes = await fetch(apiUrl(`/boards/${scrumBoard.id}/sprints/${sprint.id}/close`), {
      method: 'POST', headers,
      body: JSON.stringify({ incompleteIssuesAction: 'MOVE_TO_BACKLOG' }),
    });
    expect(closeRes.status).toBe(400);
  });
});
