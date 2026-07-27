# API Hardening Design

## Goal

Remove confirmed data-integrity and query-amplification defects in `apps/api` without silently changing the response semantics consumed by the web client.

## Scope

The change has three independent deliverables:

1. The active timer becomes single-consumer: a timer can be started only once and can produce at most one time log when stopped concurrently.
2. Custom-field rendering resolves referenced users and versions in batches. Read endpoints no longer persist lazy enum-config migrations.
3. Board assembly avoids repeated full-array scans and board card queries select only the fields that the card mapper uses.

## Timer Design

`ValkeyService` gains narrowly typed primitives for `SET NX EX`, compare-and-delete, and compare-and-set. `startTimer` uses `SET NX EX`; losing the race returns the existing timer in the existing conflict response. `stopTimer` first reads a timer snapshot and validates the issue and current permission, then removes that exact snapshot with an atomic Lua compare-and-delete. This preserves a timer when the stop is rejected while still allowing only one concurrent stop to create a time log. `updateTimerDescription` uses compare-and-set against the same snapshot, so a stale update cannot recreate a timer after stop or discard. A failed log write does not recreate a successfully consumed timer; retries must not duplicate a log.

## Custom Fields Design

`getFieldsForIssue` loads field definitions and stored values, collects every referenced user and version ID, then loads each referenced model once. DTO construction receives lookup maps and performs no I/O. Enum configuration is normalized only in memory on read; legacy persistence is not part of a GET request. Existing explicit create/update paths continue to write normalized configurations.

## Board Read Design

The board retains its current show-all API contract. The repository selects a card-specific projection rather than generic relation records, and the service groups issues in one pass by status before mapping columns. Epic swimlanes reuse this grouped representation instead of rescanning every issue for every column. This improves CPU, payload shape, and relation data volume but does not claim to solve pagination.

## Explicitly Deferred

Hard pagination for board, Gantt and comment replies is intentionally deferred. Adding a hidden `take` would make existing clients silently miss data; a correct solution requires a versioned cursor contract and corresponding `apps/web` virtualization/load-more flow. This work will be planned separately.

## Error Handling and Tests

The timer preserves current domain error codes. Unit tests cover concurrent-start loss, exactly-once stop, rejected-stop state preservation, stop/update and discard/update races, batch lookup behaviour for custom fields, and unchanged board grouping semantics. API checks run with the focused Jest suites, lint, and type checking before handoff.

## Verification

Completed on 2026-07-27:

```sh
cd apps/api && pnpm check-types && pnpm lint
```

Both commands exited with code 0.

```sh
cd apps/api && pnpm test:unit -- active-timer.service.spec.ts valkey.service.spec.ts normalize-enum-config.spec.ts custom-field-values.service.spec.ts custom-fields.service.spec.ts custom-field-validator.service.spec.ts board-data.service.spec.ts
```

All selected suites passed: 7 suites and 151 tests. The unit-test run emitted existing `ts-jest` TS151002 configuration warnings. Integration tests were not run.
