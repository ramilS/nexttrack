import { test, expect } from '@playwright/test';
import { ApiKeysPage } from '@pages/api-keys.page';
import { PROJECTS } from '@fixtures/test-data';

test.describe('Feature: Project API keys', () => {
  test('issues a key, shows the secret once, then revokes it', async ({ page }) => {
    const apiKeys = new ApiKeysPage(page);
    await apiKeys.goto(PROJECTS.PLAT.key);
    await apiKeys.expectLoaded();

    const name = `E2E tracker ${Date.now()}`;
    const raw = await apiKeys.createKey(name);
    expect(raw).toMatch(/^nt_/);

    // Reload — the raw secret must not survive anywhere on the page; only
    // the key's name (and its prefix, from the list endpoint) may remain.
    await page.reload();
    await apiKeys.expectLoaded();
    await expect(page.getByText(raw)).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();

    await apiKeys.revoke(name);
    await expect(apiKeys.rowFor(name)).toContainText(/revoked/i);
  });
});
