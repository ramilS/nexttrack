import { test, expect } from '@playwright/test';
import { BoardPage } from '../pages/board.page';
import { IssueDetailPage } from '../pages/issue-detail.page';
import { PROJECTS } from '../fixtures/test-data';

/**
 * Regression: editing an issue on its detail page did not refresh the board —
 * the board's query cache was never invalidated, so within the 30s staleTime a
 * client-side navigation back to the board showed stale data (only a hard reload
 * helped). Fixed by `meta.invalidates: issueViews()` on the issue mutations.
 *
 * The repro MUST navigate within the SPA (card click + history back), never via
 * page.goto/reload — a full reload wipes the in-memory query cache and hides the
 * bug (false pass).
 */
test.describe('Feature: Board reflects issue edits (cache invalidation)', () => {
  test('board shows an issue title edited on the detail page after SPA back-navigation', async ({
    page,
  }) => {
    const board = new BoardPage(page);
    const detail = new IssueDetailPage(page);

    await board.goto(PROJECTS.PLAT.key);
    await board.expectLoaded();
    await board.expectCardsPresent();

    // Open a real issue that is on the board via a client-side navigation
    // (router.push), so the board query stays cached behind us.
    await board.getIssueCards().first().click();
    await page.waitForURL(/\/issues\/\d+/, { timeout: 10_000 });
    await detail.expectLoaded();

    const newTitle = `E2E board sync ${Date.now()}`;
    await detail.editTitle(newTitle);
    await expect(detail.title).toContainText(newTitle, { timeout: 10_000 });

    // Back to the board WITHOUT a reload (App Router history nav keeps the cache).
    await page.goBack();
    await board.expectLoaded();

    // Without the invalidation the board would still show the old title here.
    await expect(board.getCardByText(newTitle)).toHaveCount(1, { timeout: 15_000 });
  });
});
