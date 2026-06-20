import { type Locator, type Page, expect } from '@playwright/test';

export class ProjectsListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Projects' });
    this.createButton = page.getByRole('button', { name: /New Project/i });
  }

  async goto() {
    await this.page.goto('/projects');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async expectProjectVisible(projectName: string) {
    await expect(this.page.getByText(projectName).first()).toBeVisible();
  }

  async clickProject(projectKey: string) {
    await this.page.locator(`a[href*="/projects/${projectKey}"]`).first().click();
  }

  async openCreateDialog() {
    await this.createButton.click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async fillCreateForm(data: { name: string; key: string; description?: string }) {
    const dialog = this.page.getByRole('dialog');

    await dialog.getByLabel(/Name/i).fill(data.name);

    const keyInput = dialog.getByLabel(/Key/i);
    await keyInput.clear();
    await keyInput.fill(data.key);

    if (data.description) {
      await dialog.getByLabel(/Description/i).fill(data.description);
    }

    await dialog.getByRole('button', { name: 'Create Project' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }
}
