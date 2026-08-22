# Page Object Model (POM)

## Structure

Every page/major UI section gets a Page Object class in `apps/e2e/pages/`.

```typescript
import { type Page, type Locator, expect } from '@playwright/test';

export class ProjectIssuesPage {
  readonly page: Page;

  // Locators — defined in constructor, readonly
  readonly heading: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Issues' });
    this.createButton = page.getByRole('button', { name: /Create Issue/i });
  }

  // Navigation
  async goto(projectKey: string) {
    await this.page.goto(`/projects/${projectKey}/issues`);
  }

  // State assertions
  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async expectIssueVisible(title: string) {
    await expect(this.page.getByText(title).first()).toBeVisible();
  }

  async expectMinIssuesCount(minCount: number) {
    const rows = this.page.locator('[data-testid="issue-row"]');
    await expect(async () => {
      expect(await rows.count()).toBeGreaterThanOrEqual(minCount);
    }).toPass({ timeout: 15_000 });
  }

  // Actions
  async clickIssue(title: string) {
    await this.page.getByText(title).first().click();
  }

  async openCreateDialog() {
    await this.createButton.click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async fillCreateForm(data: { title: string }) {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel(/Title/i).fill(data.title);
    await dialog.getByRole('button', { name: /Create/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }
}
```

## Critical Rules

### No Conditional Logic in Page Objects

Page objects must be deterministic. No `if/else`, no `.catch(() => false)`, no fallbacks.

```typescript
// WRONG — hides real failures
async editTitle(newTitle: string) {
  await this.title.click();
  const input = this.page.locator('[data-testid="issue-title-input"]');
  if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await input.fill(newTitle);
  } else {
    // fallback...
  }
}

// CORRECT — single deterministic path
async editTitle(newTitle: string) {
  await this.title.click();
  const input = this.page.locator('[data-testid="issue-title-input"]');
  await expect(input).toBeVisible();
  await input.clear();
  await input.fill(newTitle);
  await input.press('Enter');
}
```

If the element isn't there, the test SHOULD fail — that's a real bug.

### No Fallback Assertions

```typescript
// WRONG — always passes, checks heading instead of columns
async expectColumnsVisible(minCount = 2) {
  const count = await columns.count();
  if (count >= minCount) return;
  await expect(this.heading).toBeVisible(); // this is NOT checking columns
}

// CORRECT — retries with toPass(), fails if columns aren't there
async expectColumnsVisible(minCount = 2) {
  await expect(async () => {
    expect(await this.getColumns().count()).toBeGreaterThanOrEqual(minCount);
  }).toPass({ timeout: 15_000 });
}
```

### Dialog Handling — Assert Open Before, Assert Closed After

```typescript
async openCreateDialog() {
  await this.createButton.click();
  await expect(this.page.getByRole('dialog')).toBeVisible(); // assert open
}

async fillCreateForm(data: { name: string }) {
  const dialog = this.page.getByRole('dialog');
  await dialog.getByLabel(/Name/i).fill(data.name);
  await dialog.getByRole('button', { name: /Create/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 }); // assert closed
}
```

### Use `expect().toPass()` for "at least N" assertions

Playwright's `toHaveCount` is exact. For "at least N", use retry block:

```typescript
await expect(async () => {
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
}).toPass({ timeout: 15_000 });
```

## Naming Convention

- File: `feature-name.page.ts` (kebab-case)
- Class: `FeatureNamePage` (PascalCase)
- Examples: `login.page.ts` → `LoginPage`, `project-issues.page.ts` → `ProjectIssuesPage`

## What Goes in a Page Object

- Locator definitions (constructor)
- Navigation (`goto`)
- Composite actions (open dialog + fill form + submit)
- State assertions (`expectLoaded`, `expectItemVisible`)

## What Does NOT Go in a Page Object

- Test logic, branching, error recovery
- API calls (use `ApiClient` in tests)
- Cross-page navigation (tests orchestrate transitions)

## Existing Page Objects

| Page Object | File | Covers |
|-------------|------|--------|
| `LoginPage` | `login.page.ts` | `/login` — email/password form |
| `SidebarPage` | `sidebar.page.ts` | Sidebar nav — links, project navigation |
| `ProjectsListPage` | `projects-list.page.ts` | `/projects` — project list, create dialog |
| `ProjectIssuesPage` | `project-issues.page.ts` | `/projects/:key/issues` — issue list, create dialog |
| `IssueDetailPage` | `issue-detail.page.ts` | `/projects/:key/issues/:number` — title, status, priority |
| `BoardPage` | `board.page.ts` | `/projects/:key/board` — columns, cards |
