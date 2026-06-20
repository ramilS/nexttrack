import { test, expect } from '@playwright/test';
import { AdminUsersPage } from '@pages/admin-users.page';
import { ADMIN_USER, TEAM_MEMBERS } from '@fixtures/test-data';

test.describe('Feature: Admin User Management', () => {
  test('admin users page loads with seeded users', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.goto();
    await adminPage.expectLoaded();

    await adminPage.expectUserVisible(ADMIN_USER.name);
  });

  test('search for a seeded user', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.goto();
    await adminPage.expectLoaded();

    await adminPage.searchUser(TEAM_MEMBERS.JORDAN.name);
    await adminPage.expectUserVisible(TEAM_MEMBERS.JORDAN.name);
  });

  test('invite user dialog opens and validates', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.goto();
    await adminPage.expectLoaded();

    await adminPage.inviteButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Invite User/i)).toBeVisible();
    await expect(dialog.locator('#invite-email')).toBeVisible();

    // Close without submitting
    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
