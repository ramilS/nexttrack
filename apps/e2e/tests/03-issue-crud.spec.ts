import { test, expect } from '@playwright/test';
import { ProjectIssuesPage } from '../pages/project-issues.page';
import { IssueDetailPage } from '../pages/issue-detail.page';
import { PROJECTS } from '../fixtures/test-data';

test.describe('Feature: Issue CRUD', () => {
  test('issue list page loads with heading and create button', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();
    await expect(issuesPage.createButton).toBeVisible();
  });

  test('seeded issues displayed in PLAT project', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueRows = page.locator('[data-testid="issue-row"]');
    await expect(async () => {
      expect(await issueRows.count()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });
  });

  test('create new issue via UI', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueTitle = `E2E Issue ${Date.now()}`;
    await issuesPage.openCreateDialog();
    await issuesPage.fillCreateForm({ title: issueTitle });

    // Issue list uses search index — ES indexing has latency.
    // Retry reload until the new issue appears in search results.
    await expect(async () => {
      await page.reload();
      await issuesPage.expectLoaded();
      await expect(page.getByText(issueTitle).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [2_000, 3_000, 5_000] });
  });

  test('open issue detail page', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueLink = page.locator('[data-testid="issue-row"]').first().locator('a').first();
    await expect(issueLink).toBeVisible({ timeout: 15_000 });

    await issueLink.click();
    await page.waitForURL(/\/issues\/\d+/, { timeout: 10_000 });

    const detailPage = new IssueDetailPage(page);
    await detailPage.expectLoaded();
  });

  test('issue detail shows status and priority controls', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueLink = page.locator('[data-testid="issue-row"]').first().locator('a').first();
    await expect(issueLink).toBeVisible({ timeout: 15_000 });
    await issueLink.click();

    const detailPage = new IssueDetailPage(page);
    await detailPage.expectLoaded();

    await expect(detailPage.statusSelect).toBeVisible();
    await expect(detailPage.prioritySelect).toBeVisible();
  });

  test('create issue dialog has required fields', async ({ page }) => {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    await issuesPage.openCreateDialog();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/Title/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create Issue' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create & Open' })).toBeVisible();
  });
});
