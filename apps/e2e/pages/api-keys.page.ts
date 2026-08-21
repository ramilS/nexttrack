import { type Page, type Locator, expect } from '@playwright/test';

export class ApiKeysPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly createButton: Locator;
  readonly secret: Locator;
  readonly doneButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'API keys' });
    this.nameInput = page.getByLabel('Name');
    this.createButton = page.getByRole('button', { name: /create key/i });
    this.secret = page.getByTestId('api-key-secret');
    this.doneButton = page.getByRole('button', { name: /done/i });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/settings/api-keys`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.nameInput).toBeVisible();
  }

  /** Fills the create form, submits it, and returns the once-shown raw secret. */
  async createKey(name: string): Promise<string> {
    await this.nameInput.fill(name);
    await this.createButton.click();
    await expect(this.secret).toBeVisible();
    const raw = await this.secret.innerText();
    await this.doneButton.click();
    return raw;
  }

  rowFor(name: string): Locator {
    return this.page.locator('li').filter({ hasText: name });
  }

  async revoke(name: string) {
    await this.rowFor(name).getByRole('button', { name: /^revoke$/i }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: /yes, revoke/i }).click();
  }
}
