# Waiting & Navigation

## Navigation Patterns

### Direct URL navigation

```typescript
await page.goto('/projects/PLAT/issues');
```

### Click + wait for URL

```typescript
await issueLink.click();
await page.waitForURL(/\/projects\/PLAT\/issues\/\d+/);
```

### Click + wait for URL from href

```typescript
const link = page.getByRole('link', { name: 'Platform Core' });
const href = await link.getAttribute('href');
await link.click();
if (href) {
  await page.waitForURL(`**${href}`, { timeout: 10_000 });
}
```

### Wait for page content after navigation

```typescript
await page.goto('/projects/PLAT/board');
await expect(page.getByRole('heading', { name: /Board/i })).toBeVisible({ timeout: 15_000 });
```

## NEVER Use These

### `waitForTimeout` (static sleep)

```typescript
// NEVER — flaky, slow, hides real problems
await page.waitForTimeout(2000);
await page.waitForTimeout(500);
```

**Instead**: use web-first assertions that auto-retry:

```typescript
await expect(page.getByText('Created')).toBeVisible();
```

### `waitForLoadState('networkidle')`

```typescript
// Avoid — unreliable with WebSocket connections, polling, analytics
await page.waitForLoadState('networkidle');
```

**Instead**: wait for specific UI elements:

```typescript
await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();
```

## When Explicit Waits Are Acceptable

### `waitForURL` — after navigation actions

```typescript
await loginPage.login(email, password);
await page.waitForURL('/dashboard', { timeout: 15_000 });
```

### `waitForResponse` — when you need to sync with API

```typescript
const responsePromise = page.waitForResponse(resp =>
  resp.url().includes('/api/projects') && resp.status() === 200
);
await createButton.click();
await responsePromise;
```

### `waitForLoadState('domcontentloaded')` — for initial page load

```typescript
await page.goto('/projects');
await page.waitForLoadState('domcontentloaded');
```

## Timeout Guidelines

| Scenario | Timeout | Why |
|----------|---------|-----|
| Standard assertion | 10s (default) | Enough for most UI updates |
| Page load with API data | 15s | Server render + API fetch |
| Dialog close after mutation | 10s | API call + re-render |
| Error message appearance | 5s | Should be fast |
| Auth redirect | 15s | Token exchange + redirect |
| Board/complex page render | 15s | Multiple API calls + render |
