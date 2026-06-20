import { test, expect } from '@playwright/test';
import { LoginPage } from '@pages/login.page';
import { SidebarPage } from '@pages/sidebar.page';

test.describe('Feature: Authentication', () => {
  test('login page renders correctly', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectFormVisible();
    await expect(loginPage.logo).toBeVisible();
    await context.close();
  });

  test('login with invalid credentials shows error', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectFormVisible();
    await loginPage.login('wrong@email.com', 'WrongPassword123!');
    await loginPage.expectError();
    await context.close();
  });

  test('authenticated user sees sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = new SidebarPage(page);
    await sidebar.expectVisible();
  });

  test('sidebar shows main navigation links', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = new SidebarPage(page);
    await expect(sidebar.dashboardLink).toBeVisible();
    await expect(sidebar.myIssuesLink).toBeVisible();
    await expect(sidebar.projectsLink).toBeVisible();
  });

  test('sidebar shows seeded projects', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = new SidebarPage(page);
    await expect(sidebar.sidebar.getByText('Platform Core')).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await context.close();
  });
});
