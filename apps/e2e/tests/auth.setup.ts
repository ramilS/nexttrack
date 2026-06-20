import { test as setup, expect } from '@playwright/test';
import { ADMIN_USER, AUTH_FILE } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';

/**
 * Playwright setup project: performs UI login to capture
 * httpOnly access_token + refresh_token cookies.
 * Saves storageState for all subsequent test projects.
 */
setup('authenticate as admin', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.expectFormVisible();

  await loginPage.login(ADMIN_USER.email, ADMIN_USER.password);

  // Wait for redirect to dashboard (login success)
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Verify we're logged in — sidebar should be visible with the logo
  await expect(page.getByText('NextTrack')).toBeVisible();

  // Save authentication state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
});
