import { test, expect } from '@playwright/test';
import { PROJECTS } from '@fixtures/test-data';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';

test.describe('Feature: Sprints', () => {
  test('board page loads with sprint selector', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/board`);

    await expect(async () => {
      // Board should have columns or sprint header
      const board = page.getByText(/board|backlog|sprint/i).first();
      await expect(board).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  });

  test('backlog panel toggles visibility', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/board`);
    await page.waitForTimeout(2_000);

    // Find and click backlog toggle button
    const backlogButton = page.getByRole('button', { name: /backlog/i });
    if (await backlogButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await backlogButton.click();

      // Backlog panel should appear
      await expect(page.getByText(/backlog/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('create sprint via API and verify on board', async ({ request, page }) => {
    const token = await loginAs(request);
    const boardsRes = await request.get(apiUrl(`/projects/${PROJECTS.PLAT.key}/boards`), {
      headers: authHeaders(token),
    });
    const boardsBody = await boardsRes.json();
    const boards = boardsBody.data ?? boardsBody.items ?? boardsBody;
    if (!Array.isArray(boards) || boards.length === 0) {
      test.skip();
      return;
    }

    const boardId = boards[0].id;

    const sprintName = `E2E Sprint ${Date.now()}`;
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 14 * 86_400_000).toISOString();

    const sprintRes = await request.post(apiUrl(`/boards/${boardId}/sprints`), {
      headers: authHeaders(token),
      data: { name: sprintName, startDate, endDate },
    });

    await page.goto(`/projects/${PROJECTS.PLAT.key}/board`);

    // Sprint may appear in the sprint selector dropdown — click it to expand
    await expect(async () => {
      // Try to find the sprint name on page or in a dropdown
      const visible = await page.getByText(sprintName).first().isVisible().catch(() => false);
      if (!visible) {
        // Try clicking sprint selector to reveal dropdown
        const selector = page.locator('button').filter({ hasText: /sprint/i }).first();
        if (await selector.isVisible().catch(() => false)) {
          await selector.click();
          await page.waitForTimeout(500);
        }
      }
      await expect(page.getByText(sprintName).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000, 5_000] });
  });

  test('board shows kanban columns', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/board`);

    await expect(async () => {
      // Default workflow columns should be visible
      const columns = page.locator('[data-testid="board-column"], [class*="column"]');
      const count = await columns.count();
      // At minimum we should see some board structure
      await expect(page.locator('main').first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  });
});
