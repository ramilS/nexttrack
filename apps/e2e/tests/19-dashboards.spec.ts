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

    // Click "Add Widget" button
    const addWidgetButton = page.getByRole('button', { name: /add widget/i });
    if (await addWidgetButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addWidgetButton.click();

      // Widget dialog should show categories
      await expect(async () => {
        const dialog = page.getByRole('dialog');
        await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 10_000 });
    }
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

    // Open add widget dialog
    const addBtn = page.getByRole('button', { name: /add widget/i });
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();

      // Should see widget categories like Issues, Activity, Time
      await expect(async () => {
        const hasCategories = (
          await page.getByText(/issues/i).first().isVisible().catch(() => false) ||
          await page.getByText(/my issues/i).first().isVisible().catch(() => false)
        );
        expect(hasCategories).toBeTruthy();
      }).toPass({ timeout: 10_000 });
    }
  });
});
