# Error Detection in Tests

## Console Error Collection

Collect and assert on browser console errors to catch runtime issues:

```typescript
test('page loads without console errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('/projects/PLAT/issues');
  await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();

  // Filter known non-critical errors
  const criticalErrors = errors.filter(
    (e) =>
      !e.includes('ResizeObserver') &&
      !e.includes('hydration'),
  );

  expect(criticalErrors).toHaveLength(0);
});
```

## Known Non-Critical Errors (filter these)

| Error | Why it's safe |
|-------|---------------|
| `ResizeObserver loop completed with undelivered notifications` | Browser quirk with resize observers, not a bug |
| `Hydration` / `hydration mismatch` | Next.js dev mode SSR/client mismatch, not present in prod |
| `net::ERR_CONNECTION_REFUSED` for analytics | External services not available in test environment |

## Multi-Route Error Check

```typescript
test('no console errors across main routes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));

  const routes = ['/dashboard', '/projects', '/projects/PLAT/issues'];

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');
  }

  const criticalErrors = errors.filter(
    (e) => !e.includes('ResizeObserver') && !e.includes('hydration'),
  );

  expect(criticalErrors).toHaveLength(0);
});
```

## Network Error Detection

```typescript
test('no failed API requests on page load', async ({ page }) => {
  const failedRequests: string[] = [];

  page.on('response', (response) => {
    if (response.status() >= 500) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/projects/PLAT/issues');
  await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();

  expect(failedRequests).toHaveLength(0);
});
```

## Rules

- Add error detection to smoke/navigation tests, not to every CRUD test
- Always filter known non-critical errors — false positives erode trust in tests
- Include page URL in error messages for easier debugging
- Check both `pageerror` (JS exceptions) and `response` (API errors) where appropriate
