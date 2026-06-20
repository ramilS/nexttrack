import { test, expect } from '@playwright/test';
import { ProjectsListPage } from '@pages/projects-list.page';
import { PROJECTS } from '@fixtures/test-data';

test.describe('Feature: Project CRUD', () => {
  test('seeded projects visible in project list', async ({ page }) => {
    const projectsPage = new ProjectsListPage(page);
    await projectsPage.goto();
    await projectsPage.expectLoaded();

    await projectsPage.expectProjectVisible(PROJECTS.PLAT.name);
    await projectsPage.expectProjectVisible(PROJECTS.WEB.name);
    await projectsPage.expectProjectVisible(PROJECTS.MOB.name);
  });

  test('create new project via UI', async ({ page }) => {
    const projectsPage = new ProjectsListPage(page);
    await projectsPage.goto();
    await projectsPage.expectLoaded();

    const projectName = `E2E Project ${Date.now()}`;
    await projectsPage.openCreateDialog();
    await projectsPage.fillCreateForm({
      name: projectName,
      key: `E${Date.now().toString(36).slice(-3).toUpperCase()}`,
      description: 'Created by Playwright E2E test',
    });

    // Project should appear after creation — in sidebar or main list
    await expect(
      page.getByText(projectName).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('navigate into a project', async ({ page }) => {
    const projectsPage = new ProjectsListPage(page);
    await projectsPage.goto();
    await projectsPage.expectLoaded();

    await projectsPage.clickProject(PROJECTS.PLAT.key);

    await expect(page).toHaveURL(
      new RegExp(`/projects/${PROJECTS.PLAT.key}/`),
      { timeout: 10_000 },
    );
  });
});
