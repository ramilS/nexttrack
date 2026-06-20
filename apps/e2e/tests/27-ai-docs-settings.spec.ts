import { test, expect } from '@playwright/test';
import { AiDocsSettingsPage } from '@pages/ai-docs-settings.page';
import { PROJECTS } from '@fixtures/test-data';

test.describe('Feature: AI Docs settings', () => {
  test('AI Docs entry is reachable from project settings', async ({ page }) => {
    const settings = new AiDocsSettingsPage(page);
    await settings.goto(PROJECTS.PLAT.key);
    await settings.expectLoaded();
  });

  test('edits and persists a custom suggestion prompt', async ({ page }) => {
    const settings = new AiDocsSettingsPage(page);
    await settings.goto(PROJECTS.PLAT.key);
    await settings.expectLoaded();

    const value = `Custom suggestion prompt ${Date.now()}`;
    await settings.setSuggestionPrompt(value);

    await expect(page.getByText(/prompts saved/i)).toBeVisible({ timeout: 10_000 });

    // Persisted across reload.
    await page.reload();
    await settings.expectLoaded();
    await expect(settings.suggestionInput).toHaveValue(value, { timeout: 10_000 });
  });
});
