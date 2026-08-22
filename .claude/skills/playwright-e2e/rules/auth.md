# Authentication in E2E Tests

## How Auth Works

1. **`auth.setup.ts`** runs as a separate Playwright project (configured in `playwright.config.ts`)
2. It logs in via UI → waits for `/dashboard` redirect → saves cookies + localStorage to `fixtures/.auth/user.json`
3. **All subsequent tests** use saved auth state via `storageState` — no re-login needed
4. Auth state includes: httpOnly `refresh_token` cookie + localStorage `accessToken`

## Authenticated Tests (default)

Most tests run with pre-authenticated context automatically:

```typescript
// This test is already authenticated — no login needed
test('project list shows seeded projects', async ({ page }) => {
  await page.goto('/projects');
  // user is already logged in
});
```

## Unauthenticated Tests

For testing login page or auth flows, create a new context WITHOUT storageState:

```typescript
test('login page renders correctly', async ({ browser }) => {
  // New context = no saved auth state
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.expectFormVisible();

  await context.close();
});
```

## Testing Different Roles

To test as a different user (not admin):

```typescript
test('team member sees limited sidebar', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(TEAM_MEMBER.email, TEAM_MEMBER.password);
  await page.waitForURL('/dashboard');

  // Now test as team member
  const sidebar = new SidebarPage(page);
  await sidebar.expectVisible();

  await context.close();
});
```

## Rules

- Default tests use admin user auth state — no explicit login needed
- For role-specific tests: create new browser context + login as target user
- Always close custom contexts in test body: `await context.close()`
- Never modify `auth.setup.ts` for test-specific auth — create context in the test
- Auth file path: `fixtures/.auth/user.json` (gitignored)
