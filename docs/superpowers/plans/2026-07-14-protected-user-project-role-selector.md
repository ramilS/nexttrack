# Protected User Project Role Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the project role as read-only when the user is the last Project Admin and keep project-role changes available for every other membership.

**Architecture:** The users-memberships response exposes a server-computed `canChangeRole` flag. The repository loads the user's memberships once, then uses one grouped count query for Project Admin memberships so the UI does not perform one request per project. The user detail page renders the flag as either a labeled select or explanatory badge, while PATCH remains the concurrency-safe authority.

**Tech Stack:** NestJS 11, Prisma 7, Zod shared schemas, Next.js 15, React 19, TanStack Query, Vitest, Jest/Supertest.

## Global Constraints

- `canChangeRole` is `false` only for a sole Project Admin; account-level `ADMIN`/`USER` roles are out of scope.
- Use batched database reads; do not count administrators per membership.
- Keep `PATCH /projects/:key/members/:userId` authoritative for concurrent role changes.
- Use Base UI select conventions: every `SelectItem` has a `label`.
- Use `pnpm`; preserve unrelated user changes and branch `codex/fix-user-project-role-selector`.

---

### Task 1: Expose editability in the memberships API

**Files:**
- Modify: `packages/shared/src/schemas/user.schema.ts:130-144`
- Modify: `apps/api/src/modules/users/users.repository.ts:70-100, 335-350`
- Modify: `apps/api/test/users.integration-spec.ts`

**Interfaces:**
- Consumes: `GET /users/:id/memberships` and seeded system Project Admin role ID `00000000-0000-0000-0000-000000000001`.
- Produces: `UserMembership.canChangeRole: boolean` where `false` means the membership is the only Project Admin in that project.

- [x] **Step 1: Write the failing API integration test**

Add to `apps/api/test/users.integration-spec.ts`:

```ts
describe('User project memberships', () => {
  it('marks only the sole Project Admin membership as non-editable', async () => {
    const member = await createRegularUser('member@test.local', 'Project Member');
    await adminReq().post('/projects').send({ key: 'ROLE', name: 'Role Test' }).expect(201);

    const initial = await adminReq().get(`/users/${adminId}/memberships`).expect(200);
    expect(initial.body.data).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ key: 'ROLE' }),
        canChangeRole: false,
      }),
    ]);

    await adminReq()
      .post('/projects/ROLE/members')
      .send({ userId: member.id, roleId: '00000000-0000-0000-0000-000000000001' })
      .expect(201);

    const withSecondAdmin = await adminReq().get(`/users/${adminId}/memberships`).expect(200);
    expect(withSecondAdmin.body.data[0]).toEqual(expect.objectContaining({ canChangeRole: true }));
  });
});
```

- [x] **Step 2: Run the test to verify it fails for the missing field**

Run: `pnpm --filter api test:integration -- users.integration-spec.ts`

Expected: the assertion fails because `canChangeRole` is absent.

- [x] **Step 3: Add the response field and batched computation**

Extend `userMembershipSchema`:

```ts
canChangeRole: z.boolean(),
```

In `UsersRepository.findMemberships`, load rows as today, collect memberships whose `roleId` equals the Project Admin ID, then query `projectMember.groupBy({ by: ['projectId'], where: { projectId: { in: adminProjectIds }, roleId: PROJECT_ADMIN_ROLE_ID }, _count: { _all: true } })`. Build a `Map<string, number>` from the results and pass `canChangeRole` into `toMembership`: true for non-admin roles or an admin count above one.

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter api test:integration -- users.integration-spec.ts`

Expected: PASS, confirming both sole-admin protection and editability after a second admin exists.

- [x] **Step 5: Commit Task 1**

```bash
git add packages/shared/src/schemas/user.schema.ts apps/api/src/modules/users/users.repository.ts apps/api/test/users.integration-spec.ts
git commit -m "feat(users): expose project role editability"
```

### Task 2: Render a protected role badge on the user detail page

**Files:**
- Create: `apps/web/app/(main)/admin/users/[id]/page.test.tsx`
- Modify: `apps/web/app/(main)/admin/users/[id]/page.tsx:32-205`

**Interfaces:**
- Consumes: `UserMembership.canChangeRole` from Task 1, `useUserMemberships`, `useRoles`, and `projectsApi.updateMember`.
- Produces: an accessible `Project role` select for editable memberships and a descriptive non-interactive Project Admin badge for protected memberships.

- [x] **Step 1: Write the failing page test**

Mock the page hooks and UI primitives in `apps/web/app/(main)/admin/users/[id]/page.test.tsx`. Render one membership with `canChangeRole: false` and one with `canChangeRole: true`, then assert:

```ts
expect(screen.getByText('Project Admin')).toBeInTheDocument();
expect(screen.getByText('Assign another Project Admin before changing this role.')).toBeInTheDocument();
expect(screen.getByLabelText('Project role for Editable Project')).toBeInTheDocument();
expect(screen.queryByLabelText('Project role for Protected Project')).not.toBeInTheDocument();
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test:unit -- 'app/(main)/admin/users/[id]/page.test.tsx'`

Expected: FAIL because the current page renders a select for every membership and has no explanatory text.

- [x] **Step 3: Implement the smallest UI change**

In the memberships map, branch on `m.canChangeRole`. For `false`, render:

```tsx
<div className="text-right">
  <Badge variant="secondary">Project Admin</Badge>
  <p className="mt-1 text-xs text-muted-foreground">
    Assign another Project Admin before changing this role.
  </p>
</div>
```

For `true`, retain the existing select but add `aria-label={`Project role for ${m.project.name}`}` to `SelectTrigger`, add a per-membership pending state, and disable the trigger while that membership's PATCH request is pending.

- [x] **Step 4: Run the page test to verify it passes**

Run: `pnpm --filter web test:unit -- 'app/(main)/admin/users/[id]/page.test.tsx'`

Expected: PASS, with one protected role badge and one editable select.

- [x] **Step 5: Commit Task 2**

```bash
git add 'apps/web/app/(main)/admin/users/[id]/page.tsx' 'apps/web/app/(main)/admin/users/[id]/page.test.tsx'
git commit -m "fix(web): protect last project admin role"
```

### Task 3: Verify the integrated change

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-protected-user-project-role-selector.md` (mark completed steps)

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: fresh evidence that the API contract and page behavior compile and pass their focused regression tests.

- [x] **Step 1: Run API unit and integration coverage for the changed module**

Run: `pnpm --filter api test:unit -- users.service.spec.ts` and `pnpm --filter api test:integration -- users.integration-spec.ts`

Expected: both commands exit 0.

- [x] **Step 2: Run frontend regression test and type checks**

Run: `pnpm --filter web test:unit -- 'app/(main)/admin/users/[id]/page.test.tsx'` and `pnpm --filter web check-types`

Expected: both commands exit 0.

- [x] **Step 3: Inspect final diff**

Run: `git diff HEAD~2..HEAD --check` and `git status --short`

Expected: no whitespace errors; only task files and existing unrelated untracked files appear.

- [x] **Step 4: Commit plan completion markers**

```bash
git add docs/superpowers/plans/2026-07-14-protected-user-project-role-selector.md
git commit -m "docs: complete protected role selector plan"
```
