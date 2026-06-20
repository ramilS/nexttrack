import { test, expect } from '@playwright/test';
import {
  ProjectSettingsPage,
  ProjectMembersPage,
  ProjectTagsPage,
} from '../pages/project-settings.page';
import { PROJECTS, ADMIN_USER } from '../fixtures/test-data';

test.describe('Feature: Project Settings', () => {
  test('general settings page loads with project data', async ({ page }) => {
    const settingsPage = new ProjectSettingsPage(page);
    await settingsPage.goto(PROJECTS.PLAT.key);
    await settingsPage.expectLoaded();

    await expect(settingsPage.nameInput).toHaveValue(PROJECTS.PLAT.name);
  });

  test('update project description', async ({ page }) => {
    const settingsPage = new ProjectSettingsPage(page);
    await settingsPage.goto(PROJECTS.WEB.key);
    await settingsPage.expectLoaded();

    const newDesc = `E2E Description ${Date.now()}`;
    await settingsPage.updateDescription(newDesc);

    // Wait for save to complete — either a toast or the value persisting
    await expect(settingsPage.descriptionInput).toHaveValue(newDesc, { timeout: 10_000 });
  });
});

test.describe('Feature: Project Members', () => {
  test('members page loads and shows admin', async ({ page }) => {
    const membersPage = new ProjectMembersPage(page);
    await membersPage.goto(PROJECTS.PLAT.key);
    await membersPage.expectLoaded();

    await membersPage.expectMemberVisible(ADMIN_USER.name);
  });

  test('add member button is visible for admin', async ({ page }) => {
    const membersPage = new ProjectMembersPage(page);
    await membersPage.goto(PROJECTS.PLAT.key);
    await membersPage.expectLoaded();

    await expect(membersPage.addMemberButton).toBeVisible();
  });
});

test.describe('Feature: Project Tags', () => {
  test('tags page loads', async ({ page }) => {
    const tagsPage = new ProjectTagsPage(page);
    await tagsPage.goto(PROJECTS.PLAT.key);
    await tagsPage.expectLoaded();
  });

  test('create new tag via UI', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const tagsPage = new ProjectTagsPage(page);
    await tagsPage.goto(PROJECTS.PLAT.key);
    await tagsPage.expectLoaded();

    const tagName = `e2e-tag-${Date.now()}`;
    await tagsPage.createTag(tagName);

    // After dialog closes, the tag list refetches via TanStack Query invalidation.
    // Reload as fallback if the cache doesn't update quickly enough.
    await expect(async () => {
      const visible = await page.getByText(tagName, { exact: true }).first().isVisible();
      if (!visible) {
        await page.reload();
        await tagsPage.expectLoaded();
      }
      await expect(page.getByText(tagName, { exact: true }).first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 15_000, intervals: [2_000, 3_000, 5_000] });
  });
});
