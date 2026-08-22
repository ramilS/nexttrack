# Test Infrastructure

## Shared Helpers

### `helpers/env.ts` — Unified Environment Config

Single source of truth for E2E environment variables. Used by `playwright.config.ts`, `api-client.ts`, and any helper that needs URLs.

```typescript
import { getE2eEnv } from './helpers/env';
const { apiUrl, webUrl } = getE2eEnv();
```

**Rule**: Never parse `.env.e2e` or `process.env` directly in test code. Always use `getE2eEnv()`.

### `helpers/e2e-state.ts` — Typed Global State

Typed interface for process state shared between `global-setup.ts` and `global-teardown.ts`.

```typescript
import { setProcessState, getProcessState } from './helpers/e2e-state';
```

**Rule**: Never use `(globalThis as any)` to store state. Use the typed `setProcessState` / `getProcessState` functions.

### `helpers/api-client.ts` — Direct API Client

HTTP client for creating test data via API (faster and more reliable than UI).

```typescript
const api = new ApiClient();
await api.login(ADMIN_USER.email, ADMIN_USER.password);
await api.createProject({ name: 'Test', key: 'TST' });
```

## Global Setup / Teardown

### `global-setup.ts` — What Happens Before Tests

1. Starts PostgreSQL 16 + Valkey 9 containers (Testcontainers)
2. Pushes Prisma schema with `--force-reset`
3. Seeds test data (12 users, 3 projects, 75 issues)
4. Gets random free ports for API and Web
5. Starts NestJS API + Next.js Web servers
6. Waits for both to be healthy
7. Saves URLs to `.env.e2e` for `playwright.config.ts`
8. Saves state for teardown

### `global-teardown.ts` — What Happens After Tests

1. Stops server processes (SIGTERM)
2. Stops containers
3. Cleans up temp files

## Rules

### Process spawn MUST handle errors

```typescript
child.on('error', (err) => {
  console.error(`[${label}] Process error: ${err.message}`);
});
```

### Every `execSync` MUST have `stdio: 'pipe'`

So output doesn't pollute test logs. Capture and log on error only.

### Container start + DB operations order

Containers return from `.start()` when ready to accept connections. Prisma `db push` can run immediately after container start — no extra wait needed.

### Port allocation

Use `net.createServer()` → listen on port 0 → get assigned port → close. This avoids hardcoded ports and port conflicts.
