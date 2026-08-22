# Query Performance — Self-Check After Writing Any DB Access

After writing or changing ANY Prisma query (`findMany`/`findUnique`/`findFirst`/
`update`/`create`/`count`/`groupBy`/`$queryRaw`) — in a repository, service, or
processor — STOP and run this checklist before moving on. Most of these are
invisible in unit tests (which mock Prisma) and only bite on production-sized
data, so they must be caught at write time.

> This is a code-review finder dimension: keep the wrong/correct examples and
> the "acceptable exception" lists intact when editing.

## The checklist

### 1. N+1 — no query inside a loop
A query issued per loop iteration (`for`/`for..of`/`while`/`.forEach`/
`.map(async)`) is an N+1. Also **implicit N+1**: looping over results and
touching a relation that was not `include`d/`select`ed.

```typescript
// Wrong — one query per id
for (const id of ids) {
  const u = await this.prisma.user.findUnique({ where: { id } });
}

// Correct — one batched query
const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
const byId = new Map(users.map((u) => [u.id, u])); // O(1) lookup in the loop
```

**Hidden N+1 behind an abstraction:** a validator/helper called in a loop may
itself query the DB (e.g. a per-field membership check). Collect the inputs
across the whole batch and resolve them in ONE query, then validate in memory.
See `custom-field-validator.service.ts` `validateMany` for the pattern (split
sync shape-validation from a single batched existence lookup).

*Acceptable loop-with-await:* the set is small and bounded (enum values, a
human-edited config list ≤ ~15, a short-circuiting first-match search), or each
iteration is genuinely data-dependent on the previous one.

### 2. Sequential awaits that are independent → `Promise.all`
Independent reads issued back-to-back serialize their round-trips.

```typescript
// Wrong — 3 serial round-trips
const a = await repoA.find(x);
const b = await repoB.find(y);
const c = await repoC.find(z);

// Correct — one round-trip; keep guard checks in their original order after
const [a, b, c] = await Promise.all([repoA.find(x), repoB.find(y), repoC.find(z)]);
```
Note: `Promise.all` rejects on the FIRST rejection, so if you rely on a specific
error winning, check the resolved values in order afterwards (the lookups here
return `null` for not-found, they don't throw).

### 3. Per-row writes in a loop → batch
Use `createMany`/`updateMany`/`deleteMany`. Use `createMany` ONLY where rows
cannot pre-exist (e.g. the create path) — it has no conflict handling; otherwise
`upsert`. *Acceptable exception:* each row needs a distinct computed value with
no set-based equivalent — then wrap the individual writes in `$transaction` and
say why a batch op doesn't fit.

### 4. `select`/`include` — fetch only what's used
Default to `select` with the exact columns the mapper reads. Avoid bare
`findMany` (pulls every column, incl. large JSON like a Tiptap `description`)
when only a few fields are needed. Prefer nested `select` over `include` of full
relations. Each `include`d relation is a separate batched query — fewer is
cheaper.

### 5. Unbounded `findMany` → bound it
A list that grows with data needs `take` (or keyset/offset pagination). A list
that *must* return everything (a board, a Gantt range) is a deliberate exception
— but say so, and make sure (6) covers its `where`+`orderBy`. Never silently
truncate a "show all" list with a `take` cap and no UI signal.

### 6. Composite index covering the actual `where` + `orderBy`
Equality-filtered columns first, then the `orderBy` columns, in order. Without
it Postgres filter-scans and sorts on every call. **Verify the index exists in
`schema.prisma` — do not assume.**

```prisma
// Board read: WHERE projectId + deletedAt IS NULL ORDER BY priority, createdAt
@@index([projectId, deletedAt, priority, createdAt])
// Cron: WHERE resolvedAt IS NULL AND deletedAt IS NULL AND dueDate IN range
@@index([resolvedAt, deletedAt, dueDate])
```
A range/`IN` predicate or a relation-filter that an index can't serve is a sort
risk even when the code has no loop.

### 7. Paginated lists → `$transaction([findMany, count])`
Run the page query and its `count` in one transaction for a consistent total.

### 8. Aggregate in the DB, not in JS
Use `count`/`aggregate`/`groupBy`/a `$queryRaw` CTE instead of fetching all rows
and reducing in memory. *Acceptable exception:* the result needs per-group
labels or a shape `groupBy` can't express (e.g. two-level grouping, CSV export of
every row) — then the in-JS pass is justified, but bound the input (5).

## Why this is a self-check, not just a review gate
Unit tests mock Prisma, so they prove a query *compiles and is called*, never
that its SQL plan is sound. The cost only appears on production-sized tables.
Catching it at write time (this checklist) is far cheaper than a prod incident.

## Enforcement (automated)
A `PostToolUse` hook (`.claude/hooks/query-perf-reminder.sh`, wired in
`.claude/settings.json`) fires after any Edit/Write to a `apps/api/**/*.ts` file
(excluding `*.spec.ts`) that contains a `prisma`/`tx` query call or raw SQL, and
injects this checklist back into context — so the self-check is deterministic,
not dependent on remembering. New sessions pick it up automatically; in a session
that started before the hook existed, open `/hooks` once (or restart) to load it.
