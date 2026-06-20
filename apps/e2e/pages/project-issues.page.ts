import { type Locator, type Page, expect } from '@playwright/test';

export class ProjectIssuesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    // Sidebar nav also has "Issues" — scope to the page-level h1 only
    this.heading = page.getByRole('heading', { level: 1, name: 'Issues' });
    this.createButton = page.getByRole('button', { name: /Create Issue/i });
    this.rows = page.locator('[data-testid="issue-row"]');
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/issues`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async expectIssueVisible(issueTitle: string) {
    await expect(this.page.getByText(issueTitle).first()).toBeVisible();
  }

  async expectMinIssuesCount(minCount: number) {
    const rows = this.page.locator('[data-testid="issue-row"]');
    await expect(async () => {
      expect(await rows.count()).toBeGreaterThanOrEqual(minCount);
    }).toPass({ timeout: 15_000 });
  }

  async clickIssue(issueTitle: string) {
    await this.page.getByText(issueTitle).first().click();
  }

  async openCreateDialog() {
    await this.createButton.click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async fillCreateForm(data: { title: string }) {
    const dialog = this.page.getByRole('dialog');

    await dialog.getByLabel(/Title/i).fill(data.title);
    await dialog.getByRole('button', { name: 'Create Issue' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  /** Tick the row-selection checkbox on the first `count` issue rows. */
  async selectIssues(count: number) {
    for (let i = 0; i < count; i++) {
      await this.rows.nth(i).getByRole('checkbox').click();
    }
    await expect(this.page.getByText(`${count} selected`)).toBeVisible();
  }

  /** Pick a priority from the bulk-actions bar (must have a selection first). */
  async bulkSetPriority(optionLabel: string) {
    await this.page.getByRole('combobox').filter({ hasText: 'Priority' }).click();
    await this.page.getByRole('option', { name: optionLabel, exact: true }).click();
  }

  /** Pick a workflow status from the bulk-actions bar (must have a selection first). */
  async bulkSetStatus(statusName: string) {
    await this.page.getByRole('combobox').filter({ hasText: 'Status' }).click();
    await this.page.getByRole('option', { name: statusName, exact: true }).click();
  }
}
