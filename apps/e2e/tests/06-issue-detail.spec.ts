import { test, expect } from '@playwright/test';
import { IssueDetailPage } from '../pages/issue-detail.page';
import { ProjectIssuesPage } from '../pages/project-issues.page';
import { PROJECTS } from '../fixtures/test-data';

test.describe('Feature: Issue Detail', () => {
  async function navigateToFirstIssue(page: import('@playwright/test').Page) {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueLink = page.locator('[data-testid="issue-row"]').first().locator('a').first();
    await expect(issueLink).toBeVisible({ timeout: 15_000 });
    await issueLink.click();
    await page.waitForURL(/\/issues\/\d+/, { timeout: 10_000 });

    const detailPage = new IssueDetailPage(page);
    await detailPage.expectLoaded();
    return detailPage;
  }

  test('issue detail displays title, status, and priority', async ({ page }) => {
    const detailPage = await navigateToFirstIssue(page);
    await expect(detailPage.statusSelect).toBeVisible();
    await expect(detailPage.prioritySelect).toBeVisible();
  });

  test('issue detail shows assignee section', async ({ page }) => {
    await navigateToFirstIssue(page);
    await expect(page.getByText(/Assignee/i).first()).toBeVisible();
  });

  test('navigate back to issue list from detail', async ({ page }) => {
    await navigateToFirstIssue(page);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible({ timeout: 15_000 });
  });
});
