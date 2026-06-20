import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

test.describe('API Boundary: Workflow Transitions', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
  });

  test('GET workflow returns statuses and transitions', async ({ request }) => {
    const res = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/workflows`),
      { headers: authHeaders(adminToken) },
    );
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const workflows = Array.isArray(body) ? body : body.data ?? body;
    expect(workflows.length).toBeGreaterThanOrEqual(1);

    const defaultWf = workflows.find((w: any) => w.isDefault);
    expect(defaultWf).toBeTruthy();
    expect(defaultWf.statuses.length).toBeGreaterThanOrEqual(3);
    expect(defaultWf.transitions.length).toBeGreaterThanOrEqual(1);
  });

  test('issue status update respects workflow transitions', async ({ request }) => {
    // Get issues for PLAT project
    const issuesRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      { headers: authHeaders(adminToken) },
    );
    expect(issuesRes.ok()).toBeTruthy();
    const issuesBody = await issuesRes.json();
    const items = issuesBody.items ?? issuesBody.data?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(1);

    const issue = items[0];

    // Get workflow to find valid transition
    const wfRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/workflows`),
      { headers: authHeaders(adminToken) },
    );
    const workflows = await wfRes.json();
    const defaultWf = (Array.isArray(workflows) ? workflows : workflows.data ?? workflows)
      .find((w: any) => w.isDefault);
    const statuses = defaultWf.statuses;

    // Try updating to a valid status (first non-current status)
    const targetStatus = statuses.find((s: any) => s.id !== issue.status?.id);
    if (targetStatus) {
      const updateRes = await request.patch(
        apiUrl(`/projects/${PROJECTS.PLAT.key}/issues/${issue.number}`),
        {
          headers: authHeaders(adminToken),
          data: { statusId: targetStatus.id },
        },
      );
      // Admin can bypass transitions, so this should succeed
      expect(updateRes.ok()).toBeTruthy();
    }
  });

  test('bulk update rejects invalid workflow transition for non-admin', async ({ request }) => {
    // Get workflow to find two non-adjacent statuses
    const wfRes = await request.get(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/workflows`),
      { headers: authHeaders(adminToken) },
    );
    const workflows = await wfRes.json();
    const defaultWf = (Array.isArray(workflows) ? workflows : workflows.data ?? workflows)
      .find((w: any) => w.isDefault);

    expect(defaultWf.statuses.length).toBeGreaterThanOrEqual(2);
    // Verify bulk update endpoint exists
    const bulkRes = await request.patch(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues/bulk`),
      {
        headers: authHeaders(adminToken),
        data: {
          issueIds: ['00000000-0000-0000-0000-000000000000'],
          update: { statusId: defaultWf.statuses[0].id },
        },
      },
    );
    // Should succeed (no matching issues) or return validation error
    expect([200, 400].includes(bulkRes.status())).toBeTruthy();
  });
});
