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

## Integration Harness — What Is NOT Reset Between Spec Files

The integration suite runs every `*.integration-spec.ts` against one shared
Postgres and one shared Redis. `truncateTables` resets Postgres. Nothing resets
these, and both have already produced real failures:

### Redis survives the whole run — mock the producer with the processor

A BullMQ job enqueued by one spec is still there in every later spec. So when
`create-e2e-app.ts` mocks a **processor**, it must mock the matching
**producer** too. Otherwise the run accumulates jobs that no worker consumes,
and the single spec that does start a real worker (`withSearchEngine: true`)
drains the entire run's backlog — each stale id a `refresh: 'wait_for'`
round-trip — before it reaches its own documents.

Symptom to recognise: **a spec that passes alone and fails in the suite**, with
its own assertions timing out on data it just created.

```typescript
// Wrong — the processor is mocked, but the real hook keeps filling the queue
.overrideProvider(IssueIndexingProcessor).useValue(mockProcessor)

// Correct — no engine means neither end of the pipeline runs
.overrideProvider(IssueIndexingProcessor).useValue(mockProcessor)
.overrideProvider(IndexerHooksService).useValue(mockIndexerHooks)
```

### `maxWorkers: 1` alone gives all spec files ONE heap

jest's `shouldRunInBand` returns true whenever `maxWorkers <= 1`, so the suite
runs in the Jest main process and every spec file's module registry (the whole
Nest + Prisma + AWS SDK graph, ~55 MB) is retained for the rest of the run. At
44 files that reached ~3.9 GB and died with `FATAL ERROR: … JavaScript heap out
of memory` — preceded by specs "hanging" for 300–700 s, which is GC thrash at
the ceiling, not a slow test.

`workerIdleMemoryLimit` in `test/jest-integration.json` is what bounds this:
setting it *also* forces jest into worker mode, and jest then restarts the
worker between test files once its `heapUsed` crosses the limit (the check runs
when the worker is idle, never mid-file). Heap sawtooths instead of climbing.

- Do NOT remove `workerIdleMemoryLimit` — the growth returns immediately.
- Do NOT drop `maxWorkers: 1` to "get workers" — the specs share one Postgres
  and `TRUNCATE` between cases, so they must stay strictly serialized. One
  worker plus the memory limit gives serialization *and* a bounded heap.

### Teardown must release the engine container even when it fails

`teardownE2eApp` bounds `app.close()` and releases the Prisma client and the
search-engine container in a `finally`. A teardown that blows the Jest hook
timeout before `container.stop()` leaves the container and the whole app graph
alive for every remaining spec — that is how one slow teardown becomes a
suite-wide OOM.

## Async Mock Methods

All mock methods for async service dependencies MUST use `.mockResolvedValue()` or `.mockRejectedValue()`, not `.mockReturnValue()` or bare `jest.fn()`. See `nestjs-error-handling.md` for details.
