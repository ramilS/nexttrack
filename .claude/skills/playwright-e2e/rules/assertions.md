# Assertions & Auto-Waiting

## Always Use Web-First Assertions

Playwright auto-retries web-first assertions until the condition is met or timeout expires. This eliminates flakiness from timing issues.

### Correct — web-first (auto-retry)

```typescript
await expect(page.getByText('Issue created')).toBeVisible()
await expect(page.getByRole('row')).toHaveCount(5)
await expect(page.getByRole('heading')).toHaveText('Dashboard')
await expect(page.getByRole('dialog')).toBeHidden()
await expect(page).toHaveURL(/\/projects\/PLAT/)
```

### Wrong — no auto-retry

```typescript
// These evaluate once and fail if timing is off
const text = await page.textContent('.result')
expect(text).toBe('Done')  // generic expect, no retry

const isVisible = await page.isVisible('.dialog')
expect(isVisible).toBe(false)  // snapshot, no retry

const count = await page.locator('.row').count()
expect(count).toBe(5)  // snapshot, no retry
```

## Common Assertions

| Assertion | Use for |
|-----------|---------|
| `toBeVisible()` | Element is rendered and visible |
| `toBeHidden()` | Element is gone or hidden (dialog closed) |
| `toHaveText(text)` | Exact or pattern text content |
| `toContainText(text)` | Partial text match |
| `toHaveCount(n)` | Exact number of matched elements |
| `toHaveURL(url)` | Current page URL (string or regex) |
| `toHaveAttribute(name, value)` | Element attribute value |
| `toBeEnabled()` / `toBeDisabled()` | Button/input state |
| `toBeChecked()` | Checkbox/radio state |
| `toHaveValue(val)` | Input field value |

## Timeout Strategy

### Default timeouts (from playwright.config.ts)

- Test timeout: 30s
- Assertion (expect) timeout: 10s

### When to use explicit timeouts

```typescript
// Slow-loading pages (SSR, heavy data)
await expect(heading).toBeVisible({ timeout: 15_000 })

// Dialog close after API mutation
await expect(dialog).toBeHidden({ timeout: 10_000 })

// Quick checks (error messages that should appear fast)
await expect(errorMsg).toBeVisible({ timeout: 5_000 })
```

### Rules

- Default 10s is enough for most assertions — don't add timeouts unless needed
- Use 15s for pages that load data from API (issue lists, board, detail pages)
- Use 5s for elements that should appear immediately (error messages, form validation)
- NEVER use `waitForTimeout()` — it's always wrong. Use assertions instead.

## Soft Assertions

Use `expect.soft()` when you want to check multiple things without stopping on first failure:

```typescript
await expect.soft(page.getByText('Title')).toBeVisible()
await expect.soft(page.getByText('Status')).toBeVisible()
await expect.soft(page.getByText('Priority')).toBeVisible()
// All three are checked, failures collected
```

Use sparingly — prefer hard assertions for critical checks.

## Negation

```typescript
// Correct — auto-retries until element disappears
await expect(page.getByRole('dialog')).not.toBeVisible()
await expect(page.getByText('Error')).not.toBeVisible()

// Also correct — explicit hidden state
await expect(page.getByRole('dialog')).toBeHidden()
```

## Count Assertions

```typescript
// Exact count
await expect(page.getByTestId('issue-row')).toHaveCount(25)

// Min count (when exact varies)
const rows = page.getByTestId('issue-row')
expect(await rows.count()).toBeGreaterThanOrEqual(5)
```
