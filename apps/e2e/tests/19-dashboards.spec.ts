import { test, expect } from '@playwright/test';

test.describe('Feature: Dashboards', () => {
  test('dashboard page loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/dashboard|welcome back/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard shows widgets or empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2_000);

    // Either widgets are shown or empty state with "Add Widget" button
    const hasWidgets = await page.locator('[data-testid="widget-card"], [class*="widget"]').count() > 0;
    const hasEmptyState = await page.getByText(/empty|add widget|create dashboard/i).first().isVisible().catch(() => false);

    expect(hasWidgets || hasEmptyState).toBeTruthy();
  });

  test('add widget dialog opens', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2_000);

    // Create dashboard if needed
    const createDashboardButton = page.getByRole('button', { name: /create dashboard/i });
    if (await createDashboardButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await createDashboardButton.click();
      await page.waitForTimeout(1_000);
    }

    // Add Widget must be reachable on a dashboard — assert unconditionally so a
    // regression that hides it fails the test instead of passing vacuously.
    const addWidgetButton = page.getByRole('button', { name: /add widget/i });
    await expect(addWidgetButton).toBeVisible({ timeout: 5_000 });
    await addWidgetButton.click();

    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 5_000 });
  });

  test('widget categories are available', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2_000);

    // Create dashboard if needed
    const createBtn = page.getByRole('button', { name: /create dashboard/i });
    if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1_000);
    }

    // Open add widget dialog — assert it's reachable, then assert the catalog.
    const addBtn = page.getByRole('button', { name: /add widget/i });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();

    // The widget catalog lists issue-based widgets.
    await expect(page.getByText(/issues/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
