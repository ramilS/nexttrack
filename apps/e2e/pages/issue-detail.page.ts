import { type Locator, type Page, expect } from '@playwright/test';

export class IssueDetailPage {
  readonly page: Page;
  readonly title: Locator;
  readonly statusSelect: Locator;
  readonly prioritySelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator('[data-testid="issue-title"]');
    this.statusSelect = page.locator('[data-testid="issue-status"]');
    this.prioritySelect = page.locator('[data-testid="issue-priority"]');
  }

  async goto(projectKey: string, issueNumber: number) {
    await this.page.goto(`/projects/${projectKey}/issues/${issueNumber}`);
  }

  async expectLoaded() {
    await expect(this.title).toBeVisible({ timeout: 15_000 });
  }

  async expectTitle(expected: string) {
    await expect(this.title).toContainText(expected);
  }

  async editTitle(newTitle: string) {
    // The title is editable only in the page's edit mode; the 'e' shortcut
    // toggles it (IssueKeyboardShortcuts). Clicking the title before that is a
    // no-op (readOnly).
    await this.page.keyboard.press('e');
    await this.title.click();

    const input = this.page.locator('[data-testid="issue-title-input"]');
    await expect(input).toBeVisible();
    await input.clear();
    await input.fill(newTitle);
    await input.press('Enter');
  }
}
