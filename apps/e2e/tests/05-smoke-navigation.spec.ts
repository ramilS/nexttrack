import { test, expect } from '@playwright/test';
import { SidebarPage } from '@pages/sidebar.page';
import { PROJECTS } from '@fixtures/test-data';

const SMOKE_ROUTES = [
  { path: '/dashboard', check: 'main' },
  { path: '/my-issues', check: 'heading:Issues' },
  { path: '/projects', check: 'heading:Projects' },
  { path: '/profile', check: 'heading:Profile' },
  { path: '/search', check: 'heading:Search' },
  { path: '/notifications', check: 'heading:Notifications' },
  { path: `/projects/${PROJECTS.PLAT.key}/issues`, check: 'heading:Issues' },
  { path: `/projects/${PROJECTS.PLAT.key}/board`, check: 'heading:Board' },
  { path: `/projects/${PROJECTS.PLAT.key}/backlog`, check: 'main' },
  { path: `/projects/${PROJECTS.WEB.key}/issues`, check: 'heading:Issues' },
  { path: `/projects/${PROJECTS.MOB.key}/issues`, check: 'heading:Issues' },
  { path: `/projects/${PROJECTS.PLAT.key}/settings`, check: 'heading:General Settings' },
  { path: `/projects/${PROJECTS.PLAT.key}/settings/members`, check: 'heading:Members' },
  { path: `/projects/${PROJECTS.PLAT.key}/settings/tags`, check: 'heading:Tags' },
  { path: '/admin/users', check: 'heading:User Management' },
] as const;

test.describe('Feature: Smoke Navigation', () => {
  for (const route of SMOKE_ROUTES) {
    test(`${route.path} loads`, async ({ page }) => {
      await page.goto(route.path);
      if (route.check === 'main') {
        await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
      } else {
        const name = route.check.split(':')[1];
        await expect(
          page.getByRole('heading', { name: new RegExp(name!, 'i') }).first(),
        ).toBeVisible({ timeout: 15_000 });
      }
    });
  }

  test('sidebar navigation works correctly', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = new SidebarPage(page);
    await sidebar.expectVisible();

    await sidebar.navigateToProject(PROJECTS.PLAT.key, PROJECTS.PLAT.name);
    await expect(page).toHaveURL(
      new RegExp(`/projects/${PROJECTS.PLAT.key}/issues`),
    );
  });

  test('no critical console errors on navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/dashboard');
    await expect(page.locator('main')).toBeVisible();

    await page.goto('/projects');
    await expect(
      page.getByRole('heading', { name: 'Projects' }),
    ).toBeVisible();

    await page.goto(`/projects/${PROJECTS.PLAT.key}/issues`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Issues' }),
    ).toBeVisible();

    await page.goto(`/projects/${PROJECTS.PLAT.key}/board`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Board/i }),
    ).toBeVisible();

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
