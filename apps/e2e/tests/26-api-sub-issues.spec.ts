import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

test.describe('API Boundary: Sub-Issues & Hierarchy', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
  });

  test('create issue with parent (sub-issue)', async ({ request }) => {
    // Get existing issues
    const issuesRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(adminToken) },
    );
    const issuesBody = await issuesRes.json();
    const items = issuesBody.items ?? issuesBody.data?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(1);

    const parentIssue = items[0];

    // Create child issue
    const createRes = await request.post(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      {
        headers: authHeaders(adminToken),
        data: {
          title: `E2E Sub-issue ${Date.now()}`,
          parentId: parentIssue.id,
        },
      },
    );
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const child = await createRes.json();
    const childData = child.data ?? child;
    expect(childData.parent).toBeTruthy();
    expect(childData.parent.id).toBe(parentIssue.id);
  });

  test('cannot create circular parent reference', async ({ request }) => {
    // Create two issues
    const res1 = await request.post(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      {
        headers: authHeaders(adminToken),
        data: { title: `E2E Cycle A ${Date.now()}` },
      },
    );
    const issueA = (await res1.json()).data ?? await res1.json();

    const res2 = await request.post(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      {
        headers: authHeaders(adminToken),
        data: { title: `E2E Cycle B ${Date.now()}`, parentId: issueA.id },
      },
    );
    const issueB = (await res2.json()).data ?? await res2.json();

    // Try to set A's parent to B (creating cycle A→B→A)
    const cycleRes = await request.patch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues/${issueA.number}`),
      {
        headers: authHeaders(adminToken),
        data: { parentId: issueB.id },
      },
    );
    expect(cycleRes.status()).toBe(400);
  });

  test('issue detail includes children list', async ({ request }) => {
    // Get issues and find one with children
    const issuesRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(adminToken) },
    );
    const issuesBody = await issuesRes.json();
    const items = issuesBody.items ?? issuesBody.data?.items ?? [];

    // Seed guarantees issues in this project — assert instead of silently skipping.
    expect(items.length).toBeGreaterThan(0);

    // Get detail of first issue — should have children array (possibly empty)
    const detailRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues/${items[0].number}`),
      { headers: authHeaders(adminToken) },
    );
    expect(detailRes.ok()).toBeTruthy();

    const detail = await detailRes.json();
    const detailData = detail.data ?? detail;
    expect(Array.isArray(detailData.children)).toBeTruthy();
  });
});
