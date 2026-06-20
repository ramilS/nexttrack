import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { TEAM_MEMBERS, PROJECTS, DEFAULT_PASSWORD } from '@fixtures/test-data';

test.describe('API Boundary: Permission Matrix', () => {
  let adminToken: string;
  let memberToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
    memberToken = await loginAs(request, TEAM_MEMBERS.JORDAN.email, DEFAULT_PASSWORD);
  });

  test('project member can read issues', async ({ request }) => {
    const res = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(memberToken) },
    );
    expect(res.ok()).toBeTruthy();
  });

  test('project member can create comments on issues', async ({ request }) => {
    const issuesRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(memberToken) },
    );
    const issuesBody = await issuesRes.json();
    const items = issuesBody.items ?? issuesBody.data?.items ?? [];

    if (items.length === 0) {
      test.skip();
      return;
    }

    const issue = items[0];

    const commentsRes = await request.post(
      apiUrl(`/issues/${issue.id}/comments`),
      {
        headers: authHeaders(memberToken),
        data: {
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E2E test comment' }] }] },
        },
      },
    );
    expect([200, 201].includes(commentsRes.status())).toBeTruthy();
  });

  test('non-member cannot access private project', async () => {
    // Create a private project as admin (use fetch to avoid cookie leaking)
    const suffix = String(Date.now()).slice(-4);
    const createRes = await fetch(apiUrl('/projects'), {
      method: 'POST',
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Private E2E ${suffix}`,
        key: `PV${suffix}`,
        isPrivate: true,
      }),
    });

    if (!createRes.ok) {
      test.skip();
      return;
    }

    const project = await createRes.json();
    const projectData = project.data ?? project;

    // Non-member should get 403 (use fetch to ensure no admin cookies leak)
    const memberRes = await fetch(
      apiUrl(`/projects/${projectData.key}/issues`),
      { headers: authHeaders(memberToken) },
    );
    expect([403, 404]).toContain(memberRes.status);
  });

  test('admin can access all projects regardless of membership', async ({ request }) => {
    const res = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(adminToken) },
    );
    expect(res.ok()).toBeTruthy();
  });

  test('regular user cannot manage roles', async () => {
    // Use fetch to avoid Playwright's request fixture carrying admin cookies
    const res = await fetch(apiUrl('/roles'), {
      headers: authHeaders(memberToken),
    });
    expect([403, 401]).toContain(res.status);
  });

  test('admin can list and manage roles', async ({ request }) => {
    const res = await request.get(apiUrl('/roles'), {
      headers: authHeaders(adminToken),
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const roles = Array.isArray(body) ? body : body.data ?? body;
    expect(roles.length).toBeGreaterThanOrEqual(5);
  });
});
