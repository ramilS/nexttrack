import { test, expect } from '@playwright/test';
import { ProfilePage } from '@pages/profile.page';
import { ADMIN_USER } from '@fixtures/test-data';

test.describe('Feature: Profile', () => {
  test('profile page loads with current user data', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();
    await profilePage.expectLoaded();

    await expect(profilePage.nameInput).toHaveValue(ADMIN_USER.name);
  });

  test('profile shows password change form', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();
    await profilePage.expectLoaded();

    await expect(profilePage.currentPasswordInput).toBeVisible();
    await expect(profilePage.newPasswordInput).toBeVisible();
    await expect(profilePage.confirmPasswordInput).toBeVisible();
    await expect(profilePage.changePasswordButton).toBeVisible();
  });

  test('update profile name', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();
    await profilePage.expectLoaded();

    const tempName = `E2E User ${Date.now()}`;
    await profilePage.updateName(tempName);

    await expect(
      page.getByText(/saved|updated|success/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Restore original name
    await profilePage.updateName(ADMIN_USER.name);
  });
});
