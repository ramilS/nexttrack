---
name: playwright-e2e
description: Guide for writing high-quality Playwright E2E tests in the NextTrack project. Use when creating, reviewing, or debugging E2E tests. Triggers on tasks involving E2E tests, Playwright specs, page objects, or test infrastructure.
license: MIT
metadata:
  author: nexttrack
  version: "1.0.0"
---

# Playwright E2E Testing Guide — NextTrack

Comprehensive guide for writing reliable, maintainable E2E tests in the NextTrack monorepo. All tests live in `apps/e2e/`.

## When to Apply

Use this skill when:
- Writing new E2E test specs
- Creating or updating Page Object Models
- Debugging flaky tests
- Adding test data fixtures
- Reviewing E2E test code
- Setting up test infrastructure

## Project Architecture

```
apps/e2e/
├── playwright.config.ts          # Config: auth, browsers, reporters, timeouts
├── global-setup.ts               # Testcontainers + server startup
├── global-teardown.ts            # Container & process cleanup
├── fixtures/
│   ├── test-data.ts              # Seeded user/project/issue constants
│   └── .auth/                    # Saved auth state (gitignored)
├── helpers/
│   ├── env.ts                    # Unified env config (single source of truth)
│   ├── e2e-state.ts              # Typed global state for setup/teardown
│   └── api-client.ts             # HTTP client for API setup/assertions
├── pages/                        # Page Object Model classes
│   ├── login.page.ts
│   ├── sidebar.page.ts
│   ├── projects-list.page.ts
│   ├── project-issues.page.ts
│   ├── issue-detail.page.ts
│   └── board.page.ts
└── tests/
    ├── auth.setup.ts             # Login setup (runs first, saves state)
    ├── 01-auth.spec.ts
    ├── 02-project-crud.spec.ts
    ├── 03-issue-crud.spec.ts
    ├── 04-board-view.spec.ts
    └── 05-smoke-navigation.spec.ts
```

## Running Tests

```bash
cd apps/e2e
pnpm test:e2e                    # Headless (requires pnpm build first)
pnpm test:e2e:ui                 # Interactive UI mode (best for debugging)
pnpm test:e2e:headed             # Visible browser
pnpm exec playwright test tests/01-auth.spec.ts  # Single spec
pnpm test:e2e:report             # View HTML report
```

## Rules

Read the individual rule files in the `rules/` directory for detailed guidance:

| Rule | Priority | Description |
|------|----------|-------------|
| `locators` | CRITICAL | Locator strategy hierarchy and patterns |
| `page-objects` | CRITICAL | Page Object Model structure and conventions |
| `assertions` | CRITICAL | Web-first assertions and auto-waiting |
| `test-structure` | HIGH | Test organization, naming, independence |
| `test-data` | HIGH | Fixture management and API-based setup |
| `auth` | HIGH | Authentication flow and state reuse |
| `waiting` | MEDIUM | Navigation waiting and timeout strategies |
| `dialogs-forms` | MEDIUM | Dialog/form interaction patterns |
| `error-detection` | MEDIUM | Console error collection and filtering |
| `anti-patterns` | HIGH | Common mistakes and how to avoid them |
| `infrastructure` | MEDIUM | Shared helpers, global setup/teardown |
| `coverage-strategy` | HIGH | What to test with E2E, target coverage, test pyramid |
| `test-planning` | HIGH | How to identify what to test from UI, user journey mapping |
| `api-boundary-testing` | HIGH | Validating backend constraints bypassing frontend |
| `checklist` | HIGH | Pre-commit checklist for new tests |

## Quick Reference

### Locator Priority (most to least preferred)

```typescript
page.getByRole('button', { name: 'Create issue' })  // 1. Semantic role
page.getByLabel('Email')                              // 2. Label
page.getByText('No issues found')                     // 3. Text content
page.getByTestId('issue-row')                         // 4. Test ID
page.locator('a[href*="/projects/"]')                 // 5. CSS (last resort)
```

### Test Template

```typescript
import { test, expect } from '@playwright/test';
import { SomePage } from '../pages/some.page';

test.describe('Feature Name', () => {
  let somePage: SomePage;

  test.beforeEach(async ({ page }) => {
    somePage = new SomePage(page);
  });

  test('descriptive behavior statement', async ({ page }) => {
    await somePage.goto();
    await somePage.expectLoaded();
    // action
    // assertion
  });
});
```

### Page Object Template

```typescript
import { type Page, type Locator, expect } from '@playwright/test';

export class FeaturePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Feature' });
    this.createButton = page.getByRole('button', { name: /Create/i });
  }

  async goto() {
    await this.page.goto('/feature');
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async create(data: { name: string }) {
    await this.createButton.click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
    await this.page.getByLabel(/Name/i).fill(data.name);
    await this.page.getByRole('button', { name: /Create/i }).click();
    await expect(this.page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
  }
}
```

### Test Data

Seeded users and projects come from `fixtures/test-data.ts` (`ADMIN_USER`,
`TEAM_MEMBER`, `TEAM_MEMBERS`, `PROJECTS`, …). Import them from there and read the
file for the current set — never copy emails/passwords/keys into a spec, they
drift when the seed changes.

### data-testid Attributes

Discover the available hooks by grepping the web app rather than trusting a list
here: `grep -rn 'data-testid' apps/web/components`. Add a new `data-testid` only
when a stable selector free of role/label is genuinely needed (see the `locators`
rule for when that is justified).
