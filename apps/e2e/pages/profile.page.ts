import { type Page, type Locator, expect } from '@playwright/test';

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly saveButton: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly changePasswordButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Profile' });
    this.nameInput = page.locator('#name');
    this.saveButton = page.getByRole('button', { name: 'Save Changes' });
    this.currentPasswordInput = page.locator('#current-password');
    this.newPasswordInput = page.locator('#new-password');
    this.confirmPasswordInput = page.locator('#confirm-password');
    this.changePasswordButton = page.getByRole('button', { name: 'Change Password' });
  }

  async goto() {
    await this.page.goto('/profile');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async updateName(newName: string) {
    await this.nameInput.clear();
    await this.nameInput.fill(newName);
    await this.saveButton.click();
  }

  async changePassword(current: string, newPass: string) {
    await this.currentPasswordInput.fill(current);
    await this.newPasswordInput.fill(newPass);
    await this.confirmPasswordInput.fill(newPass);
    await this.changePasswordButton.click();
  }
}
