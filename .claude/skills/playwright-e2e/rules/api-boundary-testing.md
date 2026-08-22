# API Boundary Testing

## Why Test Backend Constraints from E2E

Frontend can hide a button or set `maxLength` on an input — but an attacker sends requests directly. E2E tests should verify that the **backend independently validates and authorizes**, not just the UI.

This is one of the most valuable categories of E2E tests.

## Three Types of API Boundary Tests

### 1. Validation Bypass — Backend rejects invalid data

Frontend may prevent submission via HTML attributes or JS validation. Verify the API also rejects:

```typescript
test('API rejects issue title longer than 500 chars', async ({ request }) => {
  // Auth is httpOnly-cookie based — login returns { user } only, there is no
  // accessToken in the body. Playwright's `request` context retains the Set-Cookie
  // value and sends it on later calls, so no Authorization header is needed.
  // (Prefer the repo's `ApiClient` helper, which wraps exactly this.)
  await request.post('/api/auth/login', {
    data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
  });

  const res = await request.post(`/api/projects/${PROJECTS.PLAT.key}/issues`, {
    data: { title: 'x'.repeat(501) },
  });

  expect(res.status()).toBe(400);
});

test('API rejects negative time log duration', async ({ request }) => {
  await login(request); // see "Helper: Authenticated Requests" below
  const res = await request.post(`/api/issues/${issueId}/time-logs`, {
    data: { duration: -100, description: 'hack' },
  });

  expect(res.status()).toBe(400);
});

test('API rejects duplicate project key', async ({ request }) => {
  await login(request); // see "Helper: Authenticated Requests" below
  const res = await request.post('/api/projects', {
    data: { name: 'Duplicate', key: PROJECTS.PLAT.key }, // already exists
  });

  expect(res.status()).toBe(409); // or 400
});
```

### 2. Authorization Bypass — Backend enforces permissions

Even if the UI hides "Delete" button for observers, verify the API rejects it:

```typescript
test('observer cannot delete issue via API', async ({ request }) => {
  // Seed roles are assigned RANDOMLY, so never assume a fixed seeded user is an
  // observer (the test would be flaky). Set up a user with a known low-privilege
  // role via API first, then assert. Auth rides the httpOnly cookie on the
  // `request` context (no body token, no Authorization header).
  await loginAsLowPrivilegeUser(request); // create + log in via ApiClient

  const res = await request.delete(
    `/api/projects/${PROJECTS.PLAT.key}/issues/1`,
  );

  expect(res.status()).toBe(403);
});

test('non-member cannot access private project', async ({ request }) => {
  // login as user who is NOT a member of the project
  // ...
  const res = await request.get(`/api/projects/PRIVATE/issues`, {
  });

  expect(res.status()).toBe(403);
});

test('regular user cannot access admin endpoints', async ({ request }) => {
  // login as regular user
  // ...
  const res = await request.get('/api/admin/users', {
  });

  expect(res.status()).toBe(403);
});
```

### 3. Consistency Tests — UI and API agree on constraints

Verify that the same constraint is enforced in both layers:

```typescript
test.describe('project name max length is consistent', () => {
  const longName = 'x'.repeat(256);

  test('UI shows validation error', async ({ page }) => {
    const projectsPage = new ProjectsListPage(page);
    await projectsPage.goto();
    await projectsPage.openCreateDialog();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Name/i).fill(longName);
    await dialog.getByRole('button', { name: /Create/i }).click();

    await expect(dialog.getByText(/too long|max|255/i)).toBeVisible();
    await expect(dialog).toBeVisible(); // dialog stays open
  });

  test('API also rejects', async ({ request }) => {
    await login(request); // see "Helper: Authenticated Requests" below
    const res = await request.post('/api/projects', {
        data: { name: longName, key: 'LONG' },
    });

    expect(res.status()).toBe(400);
  });
});
```

## Using Playwright's `request` Fixture

Playwright's built-in `request` fixture is enough — no custom client required.
Auth is cookie-based: the JWT strategy reads the `access_token` httpOnly cookie
first and only falls back to an `Authorization: Bearer` header. After login, the
`request` context retains that cookie and sends it automatically, so later calls
need no auth header.

```typescript
import { test, expect } from '@playwright/test';
import { ADMIN_USER } from '../fixtures/test-data';

test('authenticated API call', async ({ request }) => {
  const loginRes = await request.post('/api/auth/login', {
    data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
  });
  expect(loginRes.ok()).toBeTruthy(); // body is { user } only — no token in it

  // The login cookie is now on the context; this call is authenticated.
  const res = await request.get('/api/users/me');
  expect(res.ok()).toBeTruthy();
});
```

- `request` uses `baseURL` from Playwright config — no need to construct full URLs
- It handles JSON serialization/parsing
- It's available alongside `page` in the same test

## Helper: Authenticated Requests

The repo already ships `helpers/api-client.ts` (`ApiClient`) for API setup and
assertions — use it rather than hand-rolling auth. It logs in and reuses the
session (extracting the cookie internally):

```typescript
import { ApiClient } from '../helpers/api-client';
import { ADMIN_USER } from '../fixtures/test-data';

test('API rejects invalid data', async () => {
  const api = new ApiClient();
  await api.login(ADMIN_USER.email, ADMIN_USER.password);
  // api.createProject(...), api.getIssues(...), … — see the helper for methods
});
```

For raw requests, log in once on the `request` context and reuse it — the cookie
is carried for you, so no token extraction or `Authorization` header is needed:

```typescript
import { APIRequestContext } from '@playwright/test';
import { ADMIN_USER } from '../fixtures/test-data';

async function login(request: APIRequestContext, user = ADMIN_USER) {
  const res = await request.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(res.ok()).toBeTruthy();
}
```

## What to Cover

### Validation (per entity)

| Entity | Constraints to verify via API |
|--------|-------------------------------|
| Project | name required, key unique, key format (uppercase), name max length |
| Issue | title required, title max length, valid priority/type enum |
| Comment | body required, body max length |
| Sprint | startDate < endDate, name required |
| Time log | duration > 0, issueId exists |
| User | email format, password min length |

### Authorization (per role)

| Action | Admin | Developer | Reporter | Observer |
|--------|-------|-----------|----------|----------|
| Create project | 200 | 403 | 403 | 403 |
| Create issue | 200 | 200 | 200 | 403 |
| Delete issue | 200 | 200 | 403 | 403 |
| Manage roles | 200 | 403 | 403 | 403 |
| View issues | 200 | 200 | 200 | 200 |

Test the **boundaries**: where 200 switches to 403.

## File Structure

```
tests/
  10-api-validation.spec.ts       # Validation bypass tests
  11-api-authorization.spec.ts    # Permission bypass tests
```

These tests are **fast** (no browser needed for API calls) and **stable** (no UI flakiness).
