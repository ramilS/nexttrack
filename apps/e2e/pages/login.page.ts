import { type Locator, type Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly logo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.locator('[data-testid="login-form"]');
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.errorMessage = page.getByText('Invalid email or password');
    this.logo = page.getByText('NextTrack');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async waitForFormReady() {
    // Form appears only after GET /api/auth/methods resolves
    await expect(this.form).toBeVisible({ timeout: 30_000 });
  }

  async login(email: string, password: string) {
    await this.waitForFormReady();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectFormVisible() {
    await this.waitForFormReady();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
  }
}
