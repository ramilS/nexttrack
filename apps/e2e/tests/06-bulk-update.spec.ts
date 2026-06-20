import { test, expect, type Page } from '@playwright/test';
import { ProjectIssuesPage } from '../pages/project-issues.page';
import { PROJECTS } from '../fixtures/test-data';

/**
 * Waits for the bulk-update API call and asserts it patched `expected` issues.
 * Regression guard: the frontend used to send `{ updates }` (vs the API's
 * `{ update }`) and a hardcoded status string (vs a workflow-status GUID),
 * both of which produced a 400 on every bulk change.
 */
async function expectBulkUpdate(page: Page, expected: number) {
  const response = await page.waitForResponse(
    (res) => res.url().includes('/issues/bulk') && res.request().method() === 'PATCH',
  );
  expect(response.status()).toBe(200);
  expect((await response.json()).data.updated).toBe(expected);
}

test.describe('Feature: Bulk issue update', () => {
  let issuesPage: ProjectIssuesPage;

  test.beforeEach(async ({ page }) => {
    issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();
    await issuesPage.expectMinIssuesCount(2);
    await issuesPage.selectIssues(2);
  });

  test('bulk priority change succeeds (PATCH /issues/bulk returns 200)', async ({ page }) => {
    const bulkUpdate = expectBulkUpdate(page, 2);
    await issuesPage.bulkSetPriority('High');
    await bulkUpdate;
    await expect(page.getByText('2 issues updated')).toBeVisible();
  });

  test('bulk status change sends the workflow-status id, not a hardcoded string', async ({ page }) => {
    // "In Progress" is reachable from any status (wildcard transition), so the
    // change is never blocked — a clean assertion of the contract fix.
    const bulkUpdate = expectBulkUpdate(page, 2);
    await issuesPage.bulkSetStatus('In Progress');
    await bulkUpdate;
    await expect(page.getByText('2 issues updated')).toBeVisible();
  });
});
