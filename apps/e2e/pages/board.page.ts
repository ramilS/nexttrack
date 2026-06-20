import { type Locator, type Page, expect } from '@playwright/test';

export class BoardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly boardTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /Board/i });
    this.boardTab = page.getByRole('tab', { name: 'Board' });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/board`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  getColumns(): Locator {
    return this.page.locator('[data-testid="board-column"]');
  }

  getColumnByName(name: string): Locator {
    return this.getColumns().filter({ hasText: name });
  }

  getIssueCards(): Locator {
    return this.page.locator('[data-testid="board-card"]');
  }

  async expectColumnsVisible(minCount = 2) {
    await expect(async () => {
      expect(await this.getColumns().count()).toBeGreaterThanOrEqual(minCount);
    }).toPass({ timeout: 15_000 });
  }

  async expectCardsPresent() {
    await expect(async () => {
      expect(await this.getIssueCards().count()).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
  }
}
