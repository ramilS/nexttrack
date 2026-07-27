# API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the confirmed timer race and custom-field N+1 while reducing board read amplification without changing existing API response contracts.

**Architecture:** Add atomic Valkey operations behind the existing infrastructure service, keep timer state transitions in `ActiveTimerService`, and convert custom-field display construction into a pure mapper supplied with batched reference maps. Board reads retain show-all behaviour but use a card-specific Prisma projection and one-pass grouping.

**Tech Stack:** NestJS 11, TypeScript, Prisma 7, ioredis/Valkey, Jest.

## Global Constraints

- Do not change public endpoint paths, response schemas, or error codes.
- Do not silently truncate board, Gantt, or comment data.
- Do not add dependencies.
- Use `pnpm`; retain project import aliases and Zod DTO conventions.
- Preserve the user’s existing work outside the task’s files.

---

### Task 1: Make Active Timer State Transitions Atomic

**Files:**
- Modify: `apps/api/src/valkey/valkey.service.ts`
- Modify: `apps/api/src/modules/time-tracking/active-timer.service.ts`
- Modify: `apps/api/src/modules/time-tracking/active-timer.service.spec.ts`

**Interfaces:**
- Produces `ValkeyService.setIfAbsent(key, value, ttlSeconds): Promise<boolean>` using `SET key value NX EX ttlSeconds`.
- Produces `ValkeyService.getAndDelete(key): Promise<string | null>` using Redis `GETDEL`.
- `ActiveTimerService.startTimer` must throw `TIMER_ALREADY_RUNNING` if `setIfAbsent` loses the race.
- `ActiveTimerService.stopTimer` must call `getAndDelete` exactly once before creating a time log.

- [ ] **Step 1: Write failing timer tests**

Add a start-race test where `setIfAbsent` returns `false` and assert the existing `TIMER_ALREADY_RUNNING` response. Add a stop test where the first `getAndDelete` returns a timer and a second returns `null`; assert `createFromTimer` is called exactly once and the second stop throws `TIMER_NOT_RUNNING`.

- [ ] **Step 2: Run the focused test before implementation**

Run: `cd apps/api && pnpm test:unit -- active-timer.service.spec.ts`

Expected: the new tests fail because the methods do not exist and `stopTimer` still calls `get` and `del` separately.

- [ ] **Step 3: Implement atomic Valkey primitives and adopt them**

Implement `setIfAbsent` with `this.client.set(key, value, 'EX', ttlSeconds, 'NX')` and return whether the command returned `'OK'`. Implement `getAndDelete` with `this.client.getdel(key)`. Replace the get-then-set start flow with `setIfAbsent`; replace stop’s get-then-del flow with `getAndDelete`.

- [ ] **Step 4: Run focused verification**

Run: `cd apps/api && pnpm test:unit -- active-timer.service.spec.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/valkey/valkey.service.ts apps/api/src/modules/time-tracking/active-timer.service.ts apps/api/src/modules/time-tracking/active-timer.service.spec.ts && git commit -m "fix(api): make active timer transitions atomic"`

### Task 2: Batch Custom-Field Display References and Remove Write-on-Read

**Files:**
- Modify: `apps/api/src/modules/custom-fields/custom-field-values.service.ts`
- Modify: `apps/api/src/modules/custom-fields/custom-fields.service.ts`
- Modify: `apps/api/src/modules/custom-fields/custom-field-values.service.spec.ts`
- Modify: `apps/api/src/modules/custom-fields/custom-fields.service.spec.ts`

**Interfaces:**
- `getFieldsForIssue` performs at most one user-reference lookup and one version-reference lookup regardless of field count.
- `normalizedField` returns normalized enum config without `updateConfig` from read methods.
- Display DTO output for `USER`, `MULTI_USER`, `VERSION`, and `MULTI_VERSION` remains unchanged.

- [ ] **Step 1: Write failing batching tests**

Create fields with multiple user and version values. Assert `findPublicRefsByIds` and `findManyByIds` are each called once with the union of IDs. Add tests asserting legacy enum reads return normalized config while `updateConfig` is not called.

- [ ] **Step 2: Run focused tests before implementation**

Run: `cd apps/api && pnpm test:unit -- custom-field-values.service.spec.ts custom-fields.service.spec.ts`

Expected: new tests fail because lookups happen while mapping individual fields and legacy reads write configuration.

- [ ] **Step 3: Implement pure lookup-aware DTO construction**

Collect IDs from stored values by field type, load users and versions with `Promise.all`, create maps keyed by ID, and pass maps to display/activity formatting helpers. Remove repository updates from both read-time `normalizedField` helpers.

- [ ] **Step 4: Run focused verification**

Run: `cd apps/api && pnpm test:unit -- custom-field-values.service.spec.ts custom-fields.service.spec.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/custom-fields && git commit -m "fix(api): batch custom field display lookups"`

### Task 3: Reduce Board Read Amplification Without Truncating Data

**Files:**
- Modify: `apps/api/src/modules/boards/board-issue-card.mapper.ts`
- Modify: `apps/api/src/modules/issues/issues.repository.ts`
- Modify: `apps/api/src/modules/boards/board-data.service.ts`
- Modify: `apps/api/src/modules/boards/board-data.service.spec.ts`

**Interfaces:**
- `BOARD_ISSUE_INCLUDE` selects only tag fields used by `toBoardIssueCard`.
- `partitionIssuesByColumn` processes issues once and preserves the existing output order and WIP calculation.
- Board responses remain complete and schema-compatible.

- [ ] **Step 1: Write failing grouping tests**

Extend board data tests with multiple columns and issues, including an issue with an unknown status. Assert each known-status issue appears once in its column, unknown statuses are omitted, order is preserved, and WIP values remain correct.

- [ ] **Step 2: Run focused tests before implementation**

Run: `cd apps/api && pnpm test:unit -- board-data.service.spec.ts`

Expected: the test may pass functionally but lacks the new one-pass helper; add a direct unit test for the helper’s grouped output before refactoring.

- [ ] **Step 3: Implement the narrow projection and one-pass partition**

Replace `tags: { include: { tag: true } }` with a `tag.select` containing `id`, `projectId`, `name`, `color`, and `createdAt`. Build a `Map<statusId, BoardIssueRow[]>` in one issue pass, then map columns from that map without filtering the full issue array again.

- [ ] **Step 4: Run focused verification**

Run: `cd apps/api && pnpm test:unit -- board-data.service.spec.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/boards/board-issue-card.mapper.ts apps/api/src/modules/issues/issues.repository.ts apps/api/src/modules/boards/board-data.service.ts apps/api/src/modules/boards/board-data.service.spec.ts && git commit -m "perf(api): reduce board read amplification"`

### Task 4: Verify the API Hardening Change

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-api-hardening-design.md`
- Modify: `docs/superpowers/plans/2026-07-27-api-hardening.md`

- [ ] **Step 1: Run API static checks**

Run: `cd apps/api && pnpm check-types && pnpm lint`

Expected: both commands exit with code 0.

- [ ] **Step 2: Run all changed unit suites**

Run: `cd apps/api && pnpm test:unit -- active-timer.service.spec.ts custom-field-values.service.spec.ts custom-fields.service.spec.ts board-data.service.spec.ts`

Expected: all selected suites pass.

- [ ] **Step 3: Record final verification in the design**

Append the exact commands and outcomes under a `## Verification` section. Do not claim integration coverage that was not run.

- [ ] **Step 4: Commit**

Run: `git add docs/superpowers/specs/2026-07-27-api-hardening-design.md docs/superpowers/plans/2026-07-27-api-hardening.md && git commit -m "docs: record api hardening verification"`
