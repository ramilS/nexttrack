import { type Locator, type Page, expect } from '@playwright/test';

export class SidebarPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly dashboardLink: Locator;
  readonly myIssuesLink: Locator;
  readonly projectsLink: Locator;
  readonly myTimeLink: Locator;
  readonly logo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('aside');
    this.dashboardLink = this.sidebar.getByRole('link', { name: 'Dashboard' });
    this.myIssuesLink = this.sidebar.getByRole('link', { name: 'My Issues' });
    this.projectsLink = this.sidebar.getByRole('link', { name: 'Projects' });
    this.myTimeLink = this.sidebar.getByRole('link', { name: 'My Time' });
    this.logo = this.sidebar.getByText('NextTrack');
  }

  async expectVisible() {
    await expect(this.sidebar).toBeVisible();
    await expect(this.logo).toBeVisible();
  }

  async navigateToDashboard() {
    await this.dashboardLink.click();
    await this.page.waitForURL('**/dashboard');
  }

  async navigateToMyIssues() {
    await this.myIssuesLink.click();
    await this.page.waitForURL('**/my-issues');
  }

  async navigateToProjects() {
    await this.projectsLink.click();
    await this.page.waitForURL('**/projects');
  }

  getProjectLink(projectName: string): Locator {
    return this.sidebar.getByRole('button', { name: new RegExp(projectName) });
  }

  async navigateToProject(projectKey: string, projectName: string) {
    const projectButton = this.getProjectLink(projectName);
    await projectButton.click();

    const projectIssuesLink = this.sidebar.locator(
      `a[href="/projects/${projectKey}/issues"]`,
    );
    await expect(projectIssuesLink).toBeVisible();
    await projectIssuesLink.click();
    await this.page.waitForURL(`**/projects/${projectKey}/issues`);
  }
}
