import { type Page, type Locator, expect } from '@playwright/test';

export class NotificationsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly markAllReadButton: Locator;
  readonly preferencesLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Notifications' });
    this.markAllReadButton = page.getByRole('button', { name: /Mark all read/i });
    this.preferencesLink = page.getByRole('link', { name: /Preferences/i })
      .or(page.getByRole('button', { name: /Preferences/i }));
  }

  async goto() {
    await this.page.goto('/notifications');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async expectEmptyState() {
    await expect(this.page.getByText(/no.*notifications/i)).toBeVisible();
  }
}
