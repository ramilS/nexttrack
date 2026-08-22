# Test Planning: What to Test from UI

## Step 1: Identify User Roles

Map the roles that exist in the system. For NextTrack:

| Role | Key Scenarios |
|------|---------------|
| **Admin** | Create project → invite members → configure workflow → manage roles |
| **Developer** | View my issues → take in progress → change status → close → log time |
| **QA** | Review issues → add comments → change status |
| **Reporter** | Create bug report → attach screenshot → comment |
| **Observer** | View issues (read-only), view knowledge base |

## Step 2: Map Critical User Journeys

For each role, write 3-5 most important scenarios as **end-to-end flows** (not individual clicks):

```
Developer Daily Flow:
  1. Login → see dashboard with assigned issues
  2. Click issue → change status to "In Progress"
  3. Open board → drag card to "Done" column
  4. Log time spent on issue
  5. Create new issue for blocker found

Admin Onboarding Flow:
  1. Create new project with key and description
  2. Invite team members via email
  3. Assign roles (Developer, QA, Reporter)
  4. Configure workflow statuses and transitions
  5. Create initial sprint
```

Each flow = one `test.describe.serial` or a set of independent tests.

## Step 3: Risk-Based Prioritization

For every feature, evaluate:

| | Low Impact | High Impact |
|---|-----------|-------------|
| **Frequently changed code** | Unit tests | E2E + unit tests |
| **Rarely changed code** | Skip or minimal | Smoke test |

**High risk** = frequently changed + high impact → **must have E2E**.

## Step 4: Identify What to Check from UI

### Looking at a Page — Checklist

When you see a new page/feature in the UI, ask:

**Data Display:**
- Does the list show correct items? (seeded data visible)
- Is pagination working? (if > 25 items)
- Are filters/sorting applied correctly?
- Do status/priority badges render with correct colors?

**CRUD Operations:**
- Can I create via dialog/form? (happy path)
- Does validation show errors for empty/invalid fields?
- Can I edit inline or via form?
- Does delete show confirmation? Does it actually remove?

**Navigation:**
- Does clicking an item navigate to detail page?
- Does breadcrumb/sidebar reflect current location?
- Does back button work?

**Authorization:**
- Do restricted buttons/links disappear for lower roles?
- Does direct URL access redirect unauthorized users?

**Real-time:**
- If another user changes data, does it update? (WebSocket)

### You Do NOT Need to Check:
- Every CSS class is correct
- Every icon is the right one
- Hover states and micro-animations
- Responsive layouts at every breakpoint
- Third-party component internals (shadcn/base-ui)

## Step 5: Structure Tests by Feature

### File structure mirrors features, not pages

```
tests/
  auth.setup.ts

  # Group 1: Smoke (always runs first, fast)
  01-smoke-navigation.spec.ts

  # Group 2: Core CRUD (one file per domain entity)
  02-auth.spec.ts
  03-projects.spec.ts
  04-issues.spec.ts
  05-board.spec.ts
  06-comments.spec.ts
  07-sprints.spec.ts

  # Group 3: Cross-cutting concerns
  08-permissions.spec.ts
  09-search.spec.ts

  # Group 4: API boundary (backend validation/auth bypass)
  10-api-validation.spec.ts
  11-api-authorization.spec.ts
```

### Inside each file — CRUD order

```typescript
test.describe('Issues', () => {
  // Read (uses seed data)
  test('seeded issues displayed in project', ...);
  test('issue list is paginated', ...);

  // Create
  test('create issue via dialog', ...);
  test('create issue shows validation for empty title', ...);

  // Update
  test('change issue status', ...);
  test('edit issue title on detail page', ...);

  // Delete
  test('delete issue shows confirmation dialog', ...);
});
```

### Separate files for role-specific tests

```typescript
// tests/08-permissions.spec.ts
test.describe('Permissions: Observer', () => {
  test.use({ storageState: 'fixtures/.auth/observer.json' });

  test('cannot see Create Issue button', async ({ page }) => {
    await page.goto(`/projects/${PROJECTS.PLAT.key}/issues`);
    await expect(page.getByRole('button', { name: /Create Issue/i })).not.toBeVisible();
  });

  test('can view issue details', async ({ page }) => {
    // ...
  });
});
```

## Step 6: Parameterized Smoke Tests

One test, all routes:

```typescript
const SMOKE_ROUTES = [
  { path: '/dashboard', check: 'main' },
  { path: '/projects', check: 'heading:Projects' },
  { path: '/my-issues', check: 'heading:Issues' },
  { path: `/projects/${PROJECTS.PLAT.key}/issues`, check: 'heading:Issues' },
  { path: `/projects/${PROJECTS.PLAT.key}/board`, check: 'heading:Board' },
  { path: `/projects/${PROJECTS.PLAT.key}/backlog`, check: 'main' },
  { path: '/profile', check: 'main' },
];

for (const route of SMOKE_ROUTES) {
  test(`${route.path} loads`, async ({ page }) => {
    await page.goto(route.path);
    if (route.check === 'main') {
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    } else {
      const [, name] = route.check.split(':');
      await expect(
        page.getByRole('heading', { name: new RegExp(name, 'i') }),
      ).toBeVisible({ timeout: 15_000 });
    }
  });
}
```
