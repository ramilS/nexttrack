import { type Page, type Locator, expect } from '@playwright/test';

export class AiDocsSettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly suggestionInput: Locator;
  readonly mergeInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /AI Docs/i });
    this.suggestionInput = page.locator('#suggestion-prompt');
    this.mergeInput = page.locator('#merge-prompt');
    this.saveButton = page.getByRole('button', { name: /Save prompts/i });
  }

  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/settings/ai-docs`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.suggestionInput).toBeVisible();
  }

  async setSuggestionPrompt(value: string) {
    await this.suggestionInput.clear();
    await this.suggestionInput.fill(value);
    await this.saveButton.click();
  }
}
