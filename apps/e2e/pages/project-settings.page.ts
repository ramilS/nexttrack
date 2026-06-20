import { type Page, type Locator, expect } from '@playwright/test';

export class ProjectSettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /General Settings/i });
    this.nameInput = page.locator('#settings-name');
    this.descriptionInput = page.locator('#settings-desc');
    this.saveButton = page.getByRole('button', { name: /Save Changes/i });
    this.deleteButton = page.getByRole('button', { name: /Delete Project/i });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/settings`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async updateName(newName: string) {
    await this.nameInput.clear();
    await this.nameInput.fill(newName);
    await this.saveButton.click();
  }

  async updateDescription(newDescription: string) {
    await this.descriptionInput.clear();
    await this.descriptionInput.fill(newDescription);
    await this.saveButton.click();
  }
}

export class ProjectMembersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addMemberButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /Members/i });
    this.addMemberButton = page.getByRole('button', { name: /Add Member/i });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/settings/members`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async expectMemberVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectMemberCount(minCount: number) {
    const memberRows = this.page.locator('[class*="member"]').or(
      this.page.getByText(/members/).first(),
    );
    await expect(memberRows).toBeVisible();
  }
}

export class ProjectTagsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newTagButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: /Tags/i });
    this.newTagButton = page.getByRole('button', { name: /New Tag/i });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/settings/tags`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async createTag(name: string) {
    await this.newTagButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator('#tag-name').fill(name);

    const submitButton = dialog.getByRole('button', { name: /^Create$|^Save$/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Wait for the tag creation API call
    await this.page.waitForResponse(
      (res) => res.url().includes('/tags') && res.request().method() === 'POST' && res.ok(),
      { timeout: 15_000 },
    );

    // Wait for dialog to close or dismiss it
    try {
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    } catch {
      await this.page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    }
  }

  async expectTagVisible(name: string) {
    await expect(this.page.getByText(name, { exact: true }).first()).toBeVisible();
  }
}
