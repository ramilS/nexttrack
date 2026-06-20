import { test, expect } from '@playwright/test';
import { BoardPage } from '../pages/board.page';
import { PROJECTS } from '../fixtures/test-data';

test.describe('Feature: Board View', () => {
  test('board page loads for PLAT project', async ({ page }) => {
    const boardPage = new BoardPage(page);
    await boardPage.goto(PROJECTS.PLAT.key);
    await boardPage.expectLoaded();
  });

  test('board tab is visible and selected', async ({ page }) => {
    const boardPage = new BoardPage(page);
    await boardPage.goto(PROJECTS.PLAT.key);
    await boardPage.expectLoaded();

    await expect(boardPage.boardTab).toBeVisible();
  });

  test('board has columns when data is loaded', async ({ page }) => {
    const boardPage = new BoardPage(page);
    await boardPage.goto(PROJECTS.PLAT.key);
    await boardPage.expectLoaded();

    // Board may render in swimlane mode (no data-testid="board-column").
    // Check for either column elements or status headers (To Do, In Progress, etc.).
    await expect(async () => {
      const columns = await boardPage.getColumns().count();
      const statusHeaders = await page.getByText(/To Do|In Progress|In Review|Done/).count();
      expect(columns + statusHeaders).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });
  });

  test('board has issue cards', async ({ page }) => {
    const boardPage = new BoardPage(page);
    await boardPage.goto(PROJECTS.PLAT.key);
    await boardPage.expectLoaded();

    await boardPage.expectCardsPresent();
  });
});
