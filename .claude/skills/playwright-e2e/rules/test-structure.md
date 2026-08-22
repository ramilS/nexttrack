# Test Structure & Organization

## File Naming

```
tests/
  auth.setup.ts              # Setup project (runs first)
  01-auth.spec.ts            # Numbered for logical ordering
  02-project-crud.spec.ts
  03-issue-crud.spec.ts
  ...
  12-new-feature.spec.ts
```

- All spec files: `NN-feature-name.spec.ts` (numbered prefix for execution order)
- Setup files: `feature.setup.ts`
- Number prefix determines visual ordering but tests should NOT depend on execution order

## Test Describe & Name Pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature: Issue CRUD', () => {
  test('seeded issues are displayed in project issue list', async ({ page }) => {
    // ...
  });

  test('create new issue via dialog and verify it appears in list', async ({ page }) => {
    // ...
  });

  test('open issue detail page shows title and metadata', async ({ page }) => {
    // ...
  });
});
```

### Naming Rules

- `test.describe` — feature/domain name: `'Feature: Board View'`, `'Feature: Sprint Management'`
- `test()` — behavior statement, not implementation: `'create issue via dialog'` not `'test create button'`
- Test name should answer: "What user behavior is being verified?"
- No `test('test ...')` or `test('should ...')` — just state the behavior

## Test Independence

### Each test MUST be independently runnable

```typescript
// Correct — each test sets up its own state
test('seeded projects visible in list', async ({ page }) => {
  const projectsPage = new ProjectsListPage(page);
  await projectsPage.goto();
  await projectsPage.expectLoaded();
  await projectsPage.expectProjectVisible('Platform Core');
});

test('create new project', async ({ page }) => {
  const projectsPage = new ProjectsListPage(page);
  await projectsPage.goto();
  await projectsPage.openCreateDialog();
  await projectsPage.fillCreateForm({ name: 'E2E Test Project', key: 'E2E' });
  // assert
});
```

```typescript
// Wrong — test 2 depends on test 1 having created the project
test('create project', async ({ page }) => { /* creates project */ });
test('edit the project we just created', async ({ page }) => { /* fragile! */ });
```

### Exception: `test.describe.serial`

Use ONLY when steps are logically sequential and share expensive state:

```typescript
test.describe.serial('Issue lifecycle', () => {
  test('create issue', async ({ page }) => { ... });
  test('update issue status', async ({ page }) => { ... });
  test('close issue', async ({ page }) => { ... });
});
```

## Test Size

- Aim for 10-25 lines per test (excluding setup)
- If a test exceeds 30 lines, consider:
  - Extracting actions into Page Object methods
  - Splitting into multiple focused tests
  - Using helper functions for repetitive setup

## BeforeEach Pattern

```typescript
test.describe('Feature: Issues', () => {
  let issuesPage: ProjectIssuesPage;
  let sidebar: SidebarPage;

  test.beforeEach(async ({ page }) => {
    issuesPage = new ProjectIssuesPage(page);
    sidebar = new SidebarPage(page);
  });

  test('list shows seeded issues', async ({ page }) => {
    await issuesPage.goto('PLAT');
    await issuesPage.expectLoaded();
    // ...
  });
});
```

- Initialize Page Objects in `beforeEach`, not globally
- Navigation should be in individual tests, not `beforeEach` (unless ALL tests start from same page)

## Test Tags (for selective running)

```typescript
test('admin can manage roles @admin', async ({ page }) => { ... });
test('smoke: dashboard loads @smoke', async ({ page }) => { ... });
```

Run tagged tests: `pnpm exec playwright test --grep @smoke`

## Parallelism

- Current config: `workers: 1` (sequential) — safe for shared DB state
- Tests CAN run in parallel if they operate on different data (different projects, unique names)
- When writing parallel-safe tests: use unique identifiers (timestamps, UUIDs) in created entities
