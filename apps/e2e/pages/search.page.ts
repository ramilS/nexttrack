import { type Page, type Locator, expect } from '@playwright/test';

export class SearchPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly queryInput: Locator;
  readonly resultRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Search' });
    this.queryInput = page.locator('main').getByRole('textbox').first();
    this.resultRows = page.locator('[data-testid="issue-row"]');
  }

  async goto() {
    await this.page.goto('/search');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async search(query: string) {
    await this.queryInput.fill(query);
    await this.queryInput.press('Enter');
  }

  async expectResultsVisible(minCount = 1) {
    await expect(async () => {
      expect(await this.resultRows.count()).toBeGreaterThanOrEqual(minCount);
    }).toPass({ timeout: 15_000 });
  }

  async expectEmptyState() {
    await expect(this.page.getByText(/no results|search across/i)).toBeVisible();
  }
}
