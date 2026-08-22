# Locator Strategy

## Priority Hierarchy

Always use the most resilient locator available. Ordered from most to least preferred:

### 1. Semantic Role (best)

```typescript
page.getByRole('button', { name: 'Create issue' })
page.getByRole('heading', { name: 'Issues' })
page.getByRole('link', { name: 'Dashboard' })
page.getByRole('tab', { name: 'Board' })
page.getByRole('dialog')
page.getByRole('row')
```

**Why best**: mirrors how users and assistive tech interact with the page. Survives CSS refactors, class renames, DOM restructuring.

### 2. Label (for form inputs)

```typescript
page.getByLabel('Email')
page.getByLabel('Password')
page.getByLabel(/Project name/i)
```

**Why**: tied to accessible label, not implementation. Use regex with `i` flag when casing might change.

### 3. Text Content

```typescript
page.getByText('No issues found')
page.getByText('Platform Core')
page.getByText(/Sign In/i)
```

**When**: for non-interactive elements or when role-based locators aren't specific enough. Prefer `exact: true` when text is common.

### 4. Test ID (explicit hook)

```typescript
page.getByTestId('issue-row')
page.locator('[data-testid="board-column"]')
```

**When**: no semantic alternative exists (custom components, dynamic lists, non-standard elements). Add `data-testid` to frontend component when needed.

### 5. CSS Selector (last resort)

```typescript
page.locator('a[href*="/projects/PLAT"]')
page.locator('aside')
```

**When**: URL-based navigation, structural queries. Never use class names (`.btn-primary`) — they break on CSS refactors.

## Combining Locators

### Chaining (narrow scope)

```typescript
const sidebar = page.locator('aside');
sidebar.getByRole('link', { name: 'Dashboard' })
```

### `.or()` for fallbacks

```typescript
page.locator('[data-testid="issue-title"]')
  .or(page.getByRole('heading').first())
```

### `.filter()` for narrowing

```typescript
page.getByRole('row').filter({ hasText: 'PLAT-42' })
```

## Rules

- NEVER use fragile selectors: `.class-name`, `#id`, `div > span:nth-child(3)`
- NEVER hardcode generated IDs or dynamic classes
- Use `{ exact: true }` on `getByText` when the string could match multiple elements
- Use regex (`/Create/i`) when casing or exact wording might change between locales/themes
- Prefer `getByRole` even if it requires adding `aria-label` to the frontend component — this improves both tests AND accessibility
- When a locator doesn't exist, add `data-testid` to the frontend component and document it in SKILL.md's "Available data-testid" table
