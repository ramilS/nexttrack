# Test Data Management

## Seeded Data (from `seed-dev.ts`)

The global setup runs `seed-dev.ts` which creates a consistent dataset. Constants are in `fixtures/test-data.ts`:

```typescript
import { ADMIN_USER, TEAM_MEMBER, PROJECTS, KNOWN_ISSUES } from '../fixtures/test-data';
```

### What exists

`seed-dev.ts` creates a consistent dataset: an admin plus team members with varied
roles, a few projects, issues per project, and tags/sprints/comments. For the
authoritative names, keys, counts and credentials read `fixtures/test-data.ts` —
they are exported as constants (`ADMIN_USER`, `TEAM_MEMBER`, `TEAM_MEMBERS`,
`PROJECTS`, `KNOWN_ISSUES`, …). Reference those constants in specs; never copy the
literal values, they drift when the seed changes (see "Import constants" below).

## Rules

### Use seeded data for read-only tests

```typescript
test('project list shows seeded projects', async ({ page }) => {
  await projectsPage.goto();
  await projectsPage.expectProjectVisible(PROJECTS.PLAT.name);
});
```

### Create UNIQUE data for mutation tests

**Every mutation test MUST use unique identifiers** to avoid collisions between runs.

```typescript
// CORRECT — unique per run
test('create new project', async ({ page }) => {
  const projectName = `E2E Project ${Date.now()}`;
  const projectKey = `E${Date.now().toString(36).slice(-3).toUpperCase()}`;
  await projectsPage.openCreateDialog();
  await projectsPage.fillCreateForm({ name: projectName, key: projectKey });
  await projectsPage.expectProjectVisible(projectName);
});

// WRONG — hardcoded, collides with previous runs
test('create new project', async ({ page }) => {
  await projectsPage.fillCreateForm({ name: 'E2E Test Project', key: 'E2ET' });
});
```

### Never mutate seed data destructively

```typescript
// WRONG — deleting seed project breaks all other tests
test('delete project', async ({ page }) => {
  await deleteProject(PROJECTS.PLAT.key);
});

// CORRECT — create-then-delete in same test
test('delete project', async ({ page }) => {
  const api = new ApiClient();
  await api.login(ADMIN_USER.email, ADMIN_USER.password);
  await api.createProject({ name: `To Delete ${Date.now()}`, key: 'DEL' });
  // delete via UI
});
```

### Use API setup for preconditions, UI for what you're testing

```typescript
import { ApiClient } from '../helpers/api-client';

test.beforeEach(async () => {
  const api = new ApiClient();
  await api.login(ADMIN_USER.email, ADMIN_USER.password);
  await api.createProject({ name: 'Prereq Project', key: 'PRE' });
});
```

| Scenario | Approach |
|----------|----------|
| Testing entity creation UI | UI interaction (that's the test) |
| Need pre-existing entity as context | API setup |
| Need many entities | API setup |
| Verifying seed data display | Use seeded fixtures |

### Import constants, don't hardcode

```typescript
// WRONG
await page.getByText('Platform Core').click();

// CORRECT
await page.getByText(PROJECTS.PLAT.name).click();
```
