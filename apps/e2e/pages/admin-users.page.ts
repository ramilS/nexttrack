import { type Page, type Locator, expect } from '@playwright/test';

export class AdminUsersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly inviteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /User Management/i });
    this.searchInput = page.getByPlaceholder(/Search users/i);
    this.inviteButton = page.getByRole('button', { name: /Invite User/i });
  }

  async goto() {
    await this.page.goto('/admin/users');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async searchUser(query: string) {
    await this.searchInput.fill(query);
  }

  async expectUserVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  }

  async inviteUser(email: string) {
    await this.inviteButton.click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
    const dialog = this.page.getByRole('dialog');
    await dialog.locator('#invite-email').fill(email);
    await dialog.getByRole('button', { name: /Send Invite/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }
}
