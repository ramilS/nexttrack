import { test, expect } from '@playwright/test';
import { IssueDetailPage } from '@pages/issue-detail.page';
import { ProjectIssuesPage } from '@pages/project-issues.page';
import { PROJECTS } from '@fixtures/test-data';

test.describe('Feature: Comments', () => {
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

  test('issue detail shows activity/comments section', async ({ page }) => {
    await navigateToFirstIssue(page);
    await expect(page.getByText(/Activity|Comments/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('comment editor is visible on issue detail', async ({ page }) => {
    await navigateToFirstIssue(page);
    const commentEditor = page.locator('.tiptap, [contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
  });
});
