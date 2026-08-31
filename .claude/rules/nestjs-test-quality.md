# Test Code Quality

## Use Factories, Not Inline Partial Objects

NEVER create partial mock objects with `as any` to satisfy Prisma types. Use factory functions from `@test/helpers`.

### Wrong

```typescript
prisma.user.findMany.mockResolvedValue([
  { id: 'user-2', isBlocked: false, deletedAt: null } as any,
]);

prisma.issue.findUnique.mockResolvedValue({
  id: 'issue-1', title: 'Test', status: 'TODO',
} as any);
```

### Correct

```typescript
import { buildUser, buildProject } from '@test/helpers';

prisma.user.findMany.mockResolvedValue([
  buildUser({ id: 'user-2' }),
]);

prisma.issue.findUnique.mockResolvedValue(
  buildIssue({ id: 'issue-1', title: 'Test', status: 'TODO' }),
);
```

### Why

- `as any` hides type mismatches between mock and real data — a renamed field won't cause a compile error
- Factories produce full, valid objects — you only override what's relevant for the test
- If the schema changes, you update one factory, not 50 test files

### Available Factories (`@test/helpers/factories.ts`)

- `buildUser(overrides?)` — full `User` object
- `buildProject(overrides?)` — full `Project` object
- `buildProjectMember(overrides?)` — full `ProjectMember` object
- `buildRefreshToken(overrides?)` — full `RefreshToken` object
- `buildInvite(overrides?)` — full `Invite` object

### Adding New Factories

If a factory doesn't exist for an entity you need, create it in `test/helpers/factories.ts` following the same pattern: all required fields with sensible defaults + `...overrides` spread.

## Integration Harness — Isolation Model

The integration suite runs several Jest workers in parallel. **Each worker gets
its own Postgres database and its own Valkey logical database**, provisioned by
`test/support/global-setup.ts` and addressed through `test/support/test-env.ts`
(`workerDatabaseUrl()` / `workerValkeyUrl()`, keyed on `JEST_WORKER_ID`).

- The schema is pushed once into a template database and cloned per worker with
  `CREATE DATABASE … TEMPLATE`, so each worker starts from the identical schema
  (partial unique indexes included) without paying for its own `db push`.
- Never build these URLs by hand and never point two workers at one database:
  specs `TRUNCATE` between cases, so a shared database means workers clearing
  each other's fixtures.
- `MAX_WORKERS` in `test-env.ts` is capped at 15 because Valkey ships with 16
  logical databases and worker ids are 1-based.

Within one worker, spec files still share a database — `truncateTables` resets
Postgres between cases, and **nothing resets Redis for the whole run**.

### Redis survives the whole run — mock the producer with the processor

A BullMQ job enqueued by one spec is still there in every later spec of that
worker. So when `create-e2e-app.ts` mocks a **processor**, it must mock the
matching **producer** too. Otherwise the run accumulates jobs that no worker
consumes, and the single spec that does start a real worker
(`withSearchEngine: true`) drains the backlog — each stale id a
`refresh: 'wait_for'` round-trip — before it reaches its own documents.

Symptom to recognise: **a spec that passes alone and fails in the suite**, with
its own assertions timing out on data it just created.

```typescript
// Wrong — the processor is mocked, but the real hook keeps filling the queue
.overrideProvider(IssueIndexingProcessor).useValue(mockProcessor)

// Correct — no engine means neither end of the pipeline runs
.overrideProvider(IssueIndexingProcessor).useValue(mockProcessor)
.overrideProvider(IndexerHooksService).useValue(mockIndexerHooks)
```

### Heap: `workerIdleMemoryLimit` stays

Every spec file's module registry (the whole Nest + Prisma + AWS SDK graph,
~55 MB) is retained for the rest of that worker's life. Running single-threaded
that reached ~3.9 GB across 44 files and died with `FATAL ERROR: … JavaScript
heap out of memory` — preceded by specs "hanging" for 300–700 s, which is GC
thrash at the ceiling, not a slow test.

Parallel workers now spread those registries across processes, but
`workerIdleMemoryLimit` in `test/jest-integration.json` is still what bounds
each one: jest restarts a worker between test files once its `heapUsed` crosses
the limit (the check runs when the worker is idle, never mid-file), so the heap
sawtooths instead of climbing. Do NOT remove it.

### Teardown must release the engine container even when it fails

`teardownE2eApp` bounds `app.close()` and releases the Prisma client and the
search-engine container in a `finally`. A teardown that blows the Jest hook
timeout before `container.stop()` leaves the container and the whole app graph
alive for every remaining spec — that is how one slow teardown becomes a
suite-wide OOM.

## Never Sleep — Use the Harness Barriers

Domain events, event-listener writes and search indexing are asynchronous, but
they are **not unpredictable**. `E2eContext` exposes deterministic barriers, and
a `setTimeout` before an assertion is a bug, not a wait:

| Waiting for | Use |
|---|---|
| An event listener's side effect (activity, notification, watcher, workflow rule, outbox row) | `await ctx.settle()` |
| A document to be searchable in the real engine | `await ctx.settleSearchIndex()` |

`ctx.settle()` delivers every PENDING INTERNAL outbox row to its `@OnEvent`
listeners and then drains `BackgroundTasks`, repeating until a round finds
nothing left to do (a listener can publish further events). `settleSearchIndex()`
adds a wait for the `search-indexing` queue to drain; the indexer writes with
`refresh: 'wait_for'`, so a drained queue means the documents are searchable.

There is **no background timer** delivering events. A spec that mutates and then
asserts a listener's effect without settling will see nothing.

### Wrong

```typescript
await api.post(`/issues/${issueId}/comments`).send({ body }).expect(201);
await new Promise((r) => setTimeout(r, 500));           // guessed, and slow
const activities = await ctx.prisma.activity.findMany({ where: { issueId } });
expect(activities.length).toBeGreaterThanOrEqual(1);    // passes on 0 → 1 → 5

// Also wrong — sleeps first, so the cheapest case still costs 200ms, and a
// timeout leaves the assertion vacuous
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 200));
  count = await ctx.prisma.notification.count({ ... });
  if (count > 0) break;
}
```

### Correct

```typescript
await api.post(`/issues/${issueId}/comments`).send({ body }).expect(201);
await ctx.settle();

const activities = await ctx.prisma.activity.findMany({
  where: { issueId, type: ActivityType.COMMENT_ADD },
});
expect(activities).toHaveLength(1);                     // exact, and immediate
```

The one legitimate fixed wait is a **cross-socket** Socket.IO barrier: two
clients' async `join:issue` handlers have no ack and can complete in either
order, so there is nothing to await before expecting a broadcast. See
`ROOM_JOIN_SETTLE_MS` in `realtime.integration-spec.ts` — and put the reason in
a comment when you add another.

## Assert the Contract, Not "No Crash"

An assertion the implementation cannot fail proves nothing. These all shipped in
this repo and all hid something:

| Anti-pattern | What it hid |
|---|---|
| `expect(res.status).toBeLessThan(500)` | a test POSTing to a route that does not exist (404 passed) |
| `expect([403, 404]).toContain(res.status)` | which of two different contracts the endpoint actually implements |
| `if (res.status === 201) { expect(...) }` | an upload whose only unconditional assertion was "not a 500" |
| `if (events.length > 0) { expect(...) }` | a poll that timed out — every assertion skipped, test green |
| `expect(pending.length).toBeGreaterThanOrEqual(0)` | nothing; it is always true |
| `expect(client.connected).toBe(true)` after `join:project` | the join itself — the socket was connected either way |

Rules:

- Assert the exact status with `.expect(<code>)` and the `ErrorCode` in
  `res.body.error.code`. If you cannot say which status is correct, read the
  service — the answer is in the `throw`.
- Assert exact counts (`toHaveLength(1)`, `toBe(1)`) when the fixture determines
  them, not `toBeGreaterThanOrEqual(1)`.
- Never put an assertion behind an `if`. If the condition can be false, the test
  has no coverage on that branch — assert the condition instead.
- For a "nothing happened" assertion, settle first, then assert the absence.

## Shared Test Helpers — Check Before Hand-Rolling

`test/support/auth-helper.ts` owns authentication boilerplate:

- `loginAs(app, email, password)` → `{ accessToken, refreshToken, cookies, user }`
- `authRequest(app, token)` → `{ get, post, patch, put, delete }` supertest shortcuts

`create-e2e-app.ts` owns `seedSystemRoles(prisma)`, which seeds the shared
`SYSTEM_ROLES` from `@repo/shared` — the same definitions `prisma/seed.ts` and
`prisma/seed-dev.ts` write. Never restate a role's id, name or permission list
in a spec: three hand-maintained copies of that list had already drifted (the
`Integration` role existed in the seed but not in the harness, and `seed-dev`
gave Developers a different permission set from `seed`).

## Async Mock Methods

All mock methods for async service dependencies MUST use `.mockResolvedValue()` or `.mockRejectedValue()`, not `.mockReturnValue()` or bare `jest.fn()`. See `nestjs-error-handling.md` for details.
