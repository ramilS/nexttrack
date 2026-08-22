# Pre-Commit Checklist for E2E Tests

## Before committing a new test file

- [ ] **File naming**: `NN-feature-name.spec.ts` with numbered prefix
- [ ] **Imports**: Uses `@playwright/test` for `test` and `expect`, not custom wrappers
- [ ] **Page Objects**: UI interactions go through Page Objects, not inline locators
- [ ] **Locators**: Prioritizes `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS
- [ ] **No `waitForTimeout`**: All waits use web-first assertions
- [ ] **No `force: true`**: All interactions pass actionability checks naturally
- [ ] **No `as any`**: TypeScript types are correct
- [ ] **Assertions present**: Every action has a corresponding assertion
- [ ] **Test independence**: Each test works if run alone (`playwright test --grep "test name"`)
- [ ] **Test data**: Uses `fixtures/test-data.ts` constants, not hardcoded strings
- [ ] **Unique data**: Mutation tests create unique entities (timestamp/UUID in names)
- [ ] **Dialog scoping**: Form interactions scoped to `page.getByRole('dialog')`
- [ ] **Timeout awareness**: Explicit timeout only where default 10s isn't enough
- [ ] **Seed data safe**: Test doesn't delete or destructively modify seeded data

## Before committing a new Page Object

- [ ] **File naming**: `feature-name.page.ts` in `pages/` directory
- [ ] **Class naming**: `FeatureNamePage` (PascalCase)
- [ ] **Locators in constructor**: All locators defined as `readonly` in constructor
- [ ] **Semantic locators**: Follows locator priority hierarchy
- [ ] **`expectLoaded()`**: Has minimum page-ready assertion
- [ ] **`goto()`**: Has navigation method
- [ ] **Method size**: Each method does one thing, 5-10 lines max
- [ ] **No test logic**: No conditionals, loops, or business assertions in POM

## Before committing test data changes

- [ ] **Synced with seed**: `fixtures/test-data.ts` matches `apps/api/prisma/seed-dev.ts`
- [ ] **No hardcoded passwords in tests**: Passwords only in `test-data.ts` fixture
- [ ] **API client updated**: New endpoints added to `helpers/api-client.ts` if needed

## Quick Smoke Check

Run the new test in isolation:

```bash
cd apps/e2e
pnpm exec playwright test tests/NN-new-test.spec.ts
```

Run the full suite to ensure no interference:

```bash
pnpm test:e2e
```
