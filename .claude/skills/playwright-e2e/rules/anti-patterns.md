# Anti-Patterns

## 1. Static Waits

```typescript
// NEVER
await page.waitForTimeout(2000);

// ALWAYS — use web-first assertions
await expect(page.getByText('Created')).toBeVisible();
```

## 2. Empty `.catch()` Swallowing Assertion Failures

```typescript
// NEVER — hides test failures
await expect(page.getByText(/error/i)).not.toBeVisible({ timeout: 5_000 }).catch(() => {
  // Some issue titles contain "error" — that's ok
});

// ALWAYS — don't assert things you can't control, or be specific
// If issue titles may contain "error", don't check for text "error" at all.
// Instead, check for specific error UI elements:
await expect(page.getByTestId('error-banner')).not.toBeVisible();
```

## 3. `.catch(() => false)` in Page Objects

```typescript
// NEVER — makes tests pass when they should fail
if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
  await input.fill(newTitle);
} else {
  // fallback path...
}

// ALWAYS — single deterministic path
await expect(input).toBeVisible();
await input.fill(newTitle);
```

## 4. Fallback Assertions That Always Pass

```typescript
// NEVER — checks heading instead of actual target, always passes
async expectColumnsVisible(minCount = 2) {
  const count = await columns.count();
  if (count >= minCount) return;
  await expect(this.heading).toBeVisible(); // NOT checking columns!
}

// ALWAYS — retry with toPass(), fail if target isn't there
async expectColumnsVisible(minCount = 2) {
  await expect(async () => {
    expect(await this.getColumns().count()).toBeGreaterThanOrEqual(minCount);
  }).toPass({ timeout: 15_000 });
}
```

## 5. `undefined as T` Type Lies

```typescript
// NEVER — caller gets undefined when expecting T
return undefined as T;

// ALWAYS — be explicit about what can be undefined
return undefined as unknown as T;
// Or better: narrow the return type
```

## 6. Conditional Logic in Tests

```typescript
// NEVER — test should be deterministic
if (await page.getByText('No issues').isVisible()) {
  await createIssue();
}

// ALWAYS — set up data explicitly, assert deterministically
await createIssueViaApi();
await expect(page.getByTestId('issue-row')).toHaveCount(1);
```

## 7. `.or()` Fallback Locators for Essential Elements

```typescript
// NEVER — hides missing data-testid, makes failures ambiguous
await expect(
  page.locator('[data-testid="issue-title"]').or(page.getByRole('heading').first())
).toBeVisible();

// ALWAYS — use the correct locator, add data-testid if needed
await expect(page.locator('[data-testid="issue-title"]')).toBeVisible();
```

## 8. `force: true` on Interactions

```typescript
// NEVER — hides real accessibility/visibility problems
await button.click({ force: true });

// ALWAYS — fix the UI or wait for element
await expect(button).toBeVisible();
await button.click();
```

## 9. Shared Mutable State Between Tests

```typescript
// NEVER — test 2 depends on test 1
let createdProjectKey: string;
test('create project', async ({ page }) => {
  createdProjectKey = 'NEW';
});
test('edit created project', async ({ page }) => {
  await page.goto(`/projects/${createdProjectKey}`); // undefined if test 1 skipped
});

// ALWAYS — each test owns its data
test('create and navigate to project', async ({ page }) => {
  const key = `E${Date.now().toString(36).slice(-3).toUpperCase()}`;
  // create + navigate in same test
});
```

## 10. Hardcoded Non-Unique Names in Mutation Tests

```typescript
// NEVER — collides with previous runs or parallel tests
await fillCreateForm({ name: 'E2E Test Project', key: 'E2ET' });

// ALWAYS — unique per run
const name = `E2E Project ${Date.now()}`;
const key = `E${Date.now().toString(36).slice(-3).toUpperCase()}`;
await fillCreateForm({ name, key });
```

## 11. Fragile Composite CSS Selectors

```typescript
// NEVER
page.locator('main, [role="main"]').first()  // guessing which variant exists

// ALWAYS — use semantic HTML, single selector
page.locator('main')  // the page should have a <main> element
```

## 12. Duplicated Infrastructure Code

```typescript
// NEVER — env loading in 3 different files with different implementations
// playwright.config.ts: function loadEnv() { ... }
// api-client.ts: function getApiUrl() { ... }

// ALWAYS — single shared utility
import { getE2eEnv } from './helpers/env';
const { apiUrl, webUrl } = getE2eEnv();
```

## 13. Missing Assertions After Navigation

```typescript
// NEVER — navigation without verifying destination loaded
await page.goto('/dashboard');
await page.goto('/projects');  // did dashboard even load?

// ALWAYS — verify each page loaded before moving on
await page.goto('/dashboard');
await expect(page.locator('main')).toBeVisible();

await page.goto('/projects');
await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
```
