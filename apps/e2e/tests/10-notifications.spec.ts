import { test, expect } from '@playwright/test';
import { NotificationsPage } from '@pages/notifications.page';

test.describe('Feature: Notifications', () => {
  test('notifications page loads', async ({ page }) => {
    const notificationsPage = new NotificationsPage(page);
    await notificationsPage.goto();
    await notificationsPage.expectLoaded();
  });

  test('preferences link is accessible', async ({ page }) => {
    const notificationsPage = new NotificationsPage(page);
    await notificationsPage.goto();
    await notificationsPage.expectLoaded();

    await expect(notificationsPage.preferencesLink).toBeVisible();
  });
});
