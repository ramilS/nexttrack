import { test, expect } from '@playwright/test';
import { IssueDetailPage } from '@pages/issue-detail.page';
import { ProjectIssuesPage } from '@pages/project-issues.page';
import { PROJECTS, ADMIN_USER } from '@fixtures/test-data';

test.describe('Feature: @Mentions', () => {
  async function navigateToFirstIssue(page: import('@playwright/test').Page) {
    const issuesPage = new ProjectIssuesPage(page);
    await issuesPage.goto(PROJECTS.PLAT.key);
    await issuesPage.expectLoaded();

    const issueLink = page.locator('[data-testid="issue-row"]').first().locator('a').first();
    await expect(issueLink).toBeVisible({ timeout: 15_000 });
    await issueLink.click();
    await page.waitForURL(/\/issues\/\d+/, { timeout: 10_000 });

    const detailPage = new IssueDetailPage(page);
    await detailPage.expectLoaded();
    return detailPage;
  }

  test('typing @ in comment editor shows mention suggestions popup', async ({ page }) => {
    await navigateToFirstIssue(page);

    // Focus the comment editor (last editable tiptap)
    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();

    // Wait a moment for members data to load
    await page.waitForTimeout(1_000);

    // Type @ to trigger mention popup
    await page.keyboard.type('@');

    // The mention popup renders as a div with bg-popover appended to body
    // It contains buttons with user names
    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });

    // Should show at least one user suggestion button
    const suggestionButtons = mentionPopup.locator('button');
    await expect(suggestionButtons.first()).toBeVisible({ timeout: 3_000 });
    const count = await suggestionButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('selecting a mention inserts it into the editor', async ({ page }) => {
    await navigateToFirstIssue(page);

    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();

    await page.waitForTimeout(1_000);

    // Type @ to trigger mention popup
    await page.keyboard.type('@');

    // Wait for popup to appear
    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });

    // Get the name of the first suggestion
    const firstButton = mentionPopup.locator('button').first();
    await expect(firstButton).toBeVisible({ timeout: 3_000 });
    const userName = await firstButton.locator('span.truncate').innerText();

    // Click the first suggestion
    await firstButton.click();

    // Verify mention was inserted — look for a mention node with the selected name
    const mentionNode = commentEditor.locator('[data-type="mention"]');
    await expect(mentionNode).toBeVisible({ timeout: 3_000 });
    await expect(mentionNode).toContainText(userName);
  });

  test('mention suggestions filter as user types a query', async ({ page }) => {
    await navigateToFirstIssue(page);

    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();

    await page.waitForTimeout(1_000);

    // Type @ to show all suggestions
    await page.keyboard.type('@');

    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });

    // Count initial suggestions
    const initialCount = await mentionPopup.locator('button').count();
    expect(initialCount).toBeGreaterThan(1);

    // Get the name of the first user
    const firstUserName = await mentionPopup.locator('button').first().locator('span.truncate').innerText();

    // Type a few chars from the first user's name to filter
    const filterQuery = firstUserName.substring(0, 3);
    await page.keyboard.type(filterQuery);
    await page.waitForTimeout(300);

    // Filtered count should be less or equal (more specific)
    const filteredCount = await mentionPopup.locator('button').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('Escape closes mention popup', async ({ page }) => {
    await navigateToFirstIssue(page);

    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();

    await page.waitForTimeout(1_000);

    await page.keyboard.type('@');

    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Popup should disappear
    await expect(mentionPopup).not.toBeVisible({ timeout: 3_000 });
  });

  test('current user is not shown in mention suggestions', async ({ page }) => {
    await navigateToFirstIssue(page);

    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();
    await page.waitForTimeout(1_000);

    // Type @ to show all suggestions
    await page.keyboard.type('@');

    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });

    // Collect all suggestion names
    const buttons = mentionPopup.locator('button');
    const count = await buttons.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      names.push(await buttons.nth(i).locator('span.truncate').innerText());
    }

    // The logged-in user (Alex Morgan) should NOT be in the list
    expect(names).not.toContain(ADMIN_USER.name);
  });

  test('saved comment renders mention and trailing text correctly', async ({ page }) => {
    await navigateToFirstIssue(page);

    const commentEditor = page.locator('.tiptap[contenteditable="true"]').last();
    await expect(commentEditor).toBeVisible({ timeout: 10_000 });
    await commentEditor.click();
    await page.waitForTimeout(1_000);

    // Insert mention
    await page.keyboard.type('@');
    const mentionPopup = page.locator('body > div[style*="position: absolute"] .bg-popover');
    await expect(mentionPopup).toBeVisible({ timeout: 5_000 });
    const firstButton = mentionPopup.locator('button').first();
    const userName = await firstButton.locator('span.truncate').innerText();
    await firstButton.click();
    await page.waitForTimeout(300);

    // Type text after mention
    await page.keyboard.type('please review this issue');

    // Submit comment — exact name avoids matching the per-comment "Comment
    // actions" buttons (the /Comment/i regex matched 7 elements).
    const submitButton = page.getByRole('button', { name: 'Comment', exact: true });
    await submitButton.click();
    await page.waitForTimeout(2_000);

    // Verify saved comment renders both mention and trailing text
    const lastComment = page.locator('.group\\/comment').last();
    const mentionInSaved = lastComment.locator('[data-type="mention"]');
    await expect(mentionInSaved).toBeVisible({ timeout: 5_000 });
    await expect(mentionInSaved).toContainText(userName);
    await expect(lastComment).toContainText('please review this issue');
  });
});
