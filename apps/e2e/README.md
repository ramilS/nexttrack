# E2E Tests (Playwright)

Browser-based end-to-end tests for NextTrack using [Playwright](https://playwright.dev/) and [Testcontainers](https://testcontainers.com/).

## Prerequisites

- **Docker** running (Testcontainers needs it for PostgreSQL + Redis)
- **Node.js** >= 18
- Both `apps/api` and `apps/web` must be **built** before running E2E tests

## Quick Start

```bash
# From monorepo root
pnpm build                                # build API + Web
cd apps/e2e
pnpm exec playwright install chromium     # first time only
pnpm test:e2e                             # run all E2E tests
```

## How It Works

### Infrastructure (Testcontainers)

The `global-setup.ts` automatically:

1. Starts **PostgreSQL 16** and **Valkey 9** Docker containers
2. Pushes the Prisma schema (`prisma db push`)
3. Seeds test data via `seed-dev.ts` (12 users, 3 projects, 75 issues)
4. Starts the **NestJS API** on a random port
5. Starts the **Next.js Web** app on a random port
6. Saves URLs to `.env.e2e` for Playwright to read

After tests finish, `global-teardown.ts` kills processes and stops containers.

### Authentication

- `tests/auth.setup.ts` logs in via UI as `admin@nexttrack.local` / `Password123!`
- Saves browser state (cookies + localStorage) to `fixtures/.auth/user.json`
- All subsequent tests reuse this state (no repeated logins)

### Test Data

All test data comes from `apps/api/prisma/seed-dev.ts`:

| Entity     | Count | Key examples                       |
|------------|-------|------------------------------------|
| Users      | 12    | `admin@nexttrack.local` (admin)     |
| Projects   | 3     | `PLAT`, `WEB`, `MOB`              |
| Issues     | 25/project | Various types and priorities   |
| Boards     | 1/project  | Kanban with workflow columns   |

Constants are in `fixtures/test-data.ts`.

## Running Tests

```bash
# All tests (headless)
pnpm test:e2e

# Interactive UI mode (best for debugging)
pnpm test:e2e:ui

# With visible browser
pnpm test:e2e:headed

# Single spec file
pnpm exec playwright test tests/01-auth.spec.ts

# View HTML report after run
pnpm test:e2e:report
```

## Test Structure

```
apps/e2e/
├── playwright.config.ts       # Playwright configuration
├── global-setup.ts            # Start containers + servers
├── global-teardown.ts         # Stop everything
├── fixtures/
│   ├── test-data.ts           # Seed data constants
│   └── .auth/                 # Saved auth state (gitignored)
├── helpers/
│   └── api-client.ts          # Direct API calls helper
├── pages/                     # Page Object Model
│   ├── login.page.ts
│   ├── sidebar.page.ts
│   ├── projects-list.page.ts
│   ├── project-issues.page.ts
│   ├── issue-detail.page.ts
│   └── board.page.ts
└── tests/
    ├── auth.setup.ts          # Auth setup project
    ├── 01-auth.spec.ts        # Authentication flows
    ├── 02-project-crud.spec.ts
    ├── 03-issue-crud.spec.ts
    ├── 04-board-view.spec.ts
    └── 05-smoke-navigation.spec.ts
```

## Page Object Model

Tests use Page Objects to encapsulate locator logic. Each page exposes:

- **Locators** for key elements (inputs, buttons, headings)
- **Actions** like `login()`, `openCreateDialog()`, `fillCreateForm()`
- **Assertions** like `expectLoaded()`, `expectProjectVisible()`

Example:

```typescript
const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.login('admin@nexttrack.local', 'Password123!');
```

## Adding New Tests

1. Create a spec in `tests/` (e.g., `06-my-feature.spec.ts`)
2. If new pages are needed, add a Page Object in `pages/`
3. If UI elements lack locators, add `data-testid` attributes to `apps/web` components
4. Run `pnpm test:e2e` to verify

## Adding `data-testid` Attributes

Key components already have testids:

| Component          | Attribute                    |
|--------------------|------------------------------|
| Issue row          | `data-testid="issue-row"`    |
| Issue title (h1)   | `data-testid="issue-title"`  |
| Issue title input  | `data-testid="issue-title-input"` |
| Issue status       | `data-testid="issue-status"` |
| Issue priority     | `data-testid="issue-priority"` |
| Board column       | `data-testid="board-column"` |
| Board card         | `data-testid="board-card"`   |
| Login form         | `data-testid="login-form"`   |

When adding new testids, prefer semantic names: `data-testid="{entity}-{element}"`.

## CI

E2E tests run in `.github/workflows/e2e.yml`:

- Triggered on push/PR to `main`
- Testcontainers auto-starts PostgreSQL + Redis (no GHA services needed)
- Artifacts: `playwright-report/` (14 days), `test-results/` on failure (7 days)

## Troubleshooting

### Docker not running

```
Error: Could not connect to Docker daemon
```

Start Docker Desktop or the Docker daemon.

### Port conflicts

Global setup uses random ports. If you see port errors, check for zombie processes:

```bash
lsof -i :3001  # find processes on common ports
```

### Tests time out waiting for servers

Ensure both apps are built:

```bash
pnpm build
```

### Flaky tests

- Increase `timeout` in `playwright.config.ts`
- Use `await expect(...).toBeVisible({ timeout: 15_000 })` for slow-loading content
- Run in headed mode (`pnpm test:e2e:headed`) to see what's happening
