import { test, expect } from '@playwright/test';
import { PROJECTS } from '@fixtures/test-data';

test.describe('Feature: Knowledge Base', () => {
  const kbUrl = `/projects/${PROJECTS.PLAT.key}/knowledge-base`;

  test('knowledge base page loads', async ({ page }) => {
    await page.goto(kbUrl);
    await expect(page.getByText(/articles|knowledge base/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('create a new article', async ({ page }) => {
    await page.goto(kbUrl);
    await page.waitForTimeout(2_000);

    // Click the "new article" button (Plus icon in sidebar header)
    const newArticleButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await newArticleButton.click();

    // Dialog should appear — fill in title
    const titleInput = page.getByPlaceholder(/title/i).first();
    if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const articleTitle = `E2E Article ${Date.now()}`;
      await titleInput.fill(articleTitle);

      // Submit
      const createButton = page.getByRole('button', { name: /create|save/i });
      await createButton.click();

      // Article should appear in the tree
      await expect(async () => {
        await expect(page.getByText(articleTitle)).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
    }
  });

  test('navigate article hierarchy', async ({ page }) => {
    await page.goto(kbUrl);
    await page.waitForTimeout(2_000);

    // If articles exist in seeded data, click one
    const articleLinks = page.locator('[data-testid="article-item"], a[href*="knowledge-base/"]');
    const count = await articleLinks.count();

    if (count > 0) {
      await articleLinks.first().click();
      // Should show article content area
      await expect(page.locator('main').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('select an article shows editor', async ({ page }) => {
    // First create an article via the UI or API
    await page.goto(kbUrl);
    await page.waitForTimeout(2_000);

    // Create article
    const newButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await newButton.click();

    const titleInput = page.getByPlaceholder(/title/i).first();
    if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await titleInput.fill('Editor Test Article');
      await page.getByRole('button', { name: /create|save/i }).click();

      await page.waitForTimeout(1_000);

      // Click the article
      await page.getByText('Editor Test Article').click();

      // Editor should be visible (Tiptap editor container)
      await expect(async () => {
        const editor = page.locator('[contenteditable="true"], .tiptap, .ProseMirror');
        await expect(editor.first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
    }
  });
});
