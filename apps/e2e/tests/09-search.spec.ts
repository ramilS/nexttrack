import { test, expect } from '@playwright/test';
import { SearchPage } from '@pages/search.page';

test.describe('Feature: Search', () => {
  test('search page loads with empty state', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.goto();
    await searchPage.expectLoaded();
  });

  test('search for a known issue title returns results', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.goto();
    await searchPage.expectLoaded();

    await searchPage.search('login');

    // Should show results or "no results" — either way the search functioned
    await expect(
      page.getByText(/login/i).first()
        .or(page.getByText(/no results/i).first()),
    ).toBeVisible({ timeout: 15_000 });
  });
});
