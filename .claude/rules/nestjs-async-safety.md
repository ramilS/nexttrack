# Async Safety in NestJS Services

## Domain Events — Always Through the Outbox

Domain events (issue/comment created/updated/deleted, etc.) MUST be published via `DomainEventPublisher` (`@/modules/outbox/domain-event-publisher`) **inside the same transaction** as the aggregate mutation. NEVER emit domain events with `EventEmitter2` directly from services — an in-memory emit is lost if the process crashes before listeners run.

### Correct

```typescript
await this.txService.run(async (tx) => {
  const row = await this.repo.update(id, patch, tx);
  await this.domainEvents.publish(
    {
      eventType: 'issue.updated',
      aggregateType: 'Issue',
      aggregateId: id,
      payload: { ...new IssueUpdatedEvent(...) },
    },
    tx,
  );
  return row;
});
```

### Wrong

```typescript
// In-memory emit — event is lost on crash between commit and listeners
const row = await this.repo.update(id, patch);
this.eventEmitter.emit('issue.updated', new IssueUpdatedEvent(...));

// publish outside the mutation's transaction — defeats outbox atomicity
await this.repo.update(id, patch);
await this.domainEvents.publish({ ... }, somePrismaHandle);
```

### How delivery works

`publish` writes a `DeliveryChannel.INTERNAL` outbox row; the poller routes it to the `domain-events` BullMQ queue, whose processor re-emits to `@OnEvent` listeners. Listeners themselves stay unchanged and keep using `@OnEvent` — only the *emission* side is restricted. `publish(event, tx)` takes `tx` as a REQUIRED parameter by design; do not weaken it to optional.

When OTel tracing is on (`OTEL_ENABLED=true`), `OutboxService.createOutboxEvents` captures the active W3C `traceparent` into the `outbox_events.traceparent` column; the poller copies it into the BullMQ job (`__traceparent`) and the domain-events processor restores it as the remote parent, so listener spans nest under the originating request trace across the DB-persistence gap. The column is nullable — tracing off, or an event published outside a sampled span, leaves it null. Trace plumbing never enters the listener payload.

### Listeners: at-least-once delivery, idempotent side effects

Delivery is **at-least-once**: a listener failure marks the outbox row PENDING with exponential backoff and the event is redelivered (up to `maxAttempts`, then FAILED with `lastError`). Every payload carries `eventId` (the outbox row id, merged in by the processor — type the handler param as `XxxEvent & DomainEventMeta`).

Rules for listener handlers:

- NEVER swallow errors with a catch-and-log wrapper — rethrow so the retry fires. A swallowed transient failure (search engine down, DB hiccup) silently loses the side effect forever.
- Every DB-writing side effect MUST be idempotent under redelivery:
  - Activities: wrap in `EventIdempotencyService.runOnce(`${event.eventId}:activity`, (tx) => …)` (`@/common/idempotency`) — claims the key in the SAME transaction as the write.
  - Notifications: pass `dedupeKey: `${event.eventId}:notif:${NotificationType.X}`` to `notificationsDispatch.dispatch()` — skips in-app rows, grouped increments AND outgoing email/webhook outbox rows on redelivery.
  - Watcher adds (`createMany skipDuplicates`) and indexer hooks (durable re-index-by-id queue) are naturally idempotent — call them bare.
- The ONE exception: `workflowEngine.executeRules` stays behind `.catch()` (at-most-once) — workflow actions are arbitrary and not idempotent.
- The idempotency-key claim uses `createMany({skipDuplicates})`, never try/catch around `create` — a caught P2002 poisons the surrounding Postgres transaction.
- Keys live in `idempotency_keys`, cleaned up after 7 days by the notification cleanup cron.

### Wrong (listener anti-patterns)

```typescript
// Swallowing — transient failure permanently loses the activity
@OnEvent('issue.created')
handleIssueCreated(event: IssueCreatedEvent) {
  return this.onIssueCreated(event).catch((err) => this.logger.error(err));
}

// Bare write — redelivery duplicates the activity
await this.activitiesService.recordOne(event.issueId, userId, type, payload);
```

### Correct

```typescript
@OnEvent('issue.created')
async handleIssueCreated(event: IssueCreatedEvent & DomainEventMeta): Promise<void> {
  await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
    await this.activitiesService.recordOne(event.issueId, event.userId, type, payload, tx);
  });

  await this.notificationsDispatch.dispatch({
    ...,
    dedupeKey: `${event.eventId}:notif:${NotificationType.ISSUE_ASSIGNED}`,
  });
}
```

### Acceptable `EventEmitter2.emit` usages

- `DomainEventsProcessor` and the integration-harness pump (re-emission layer)
- Purely in-process, loss-tolerant signals that no listener persists (currently: none)

### Test implications

- Listener side effects are eventually consistent. Integration tests that assert listener-produced rows (activities, notifications) right after a mutating call MUST `await ctx.pumpDomainEvents()` first.
- e2e runs with `OUTBOX_POLLER_ENABLED=true` (the poller is otherwise off under `NODE_ENV=test`).
- BullMQ custom `jobId` must not contain `:` — the poller uses `${eventId}#${attempts}` so each retry attempt gets a fresh job id (a constant id is silently deduplicated against completed/failed jobs and blocks retries entirely).

## Fire-and-Forget Pattern

When calling async methods that are intentionally not awaited (background work like indexing, notifications), you MUST use `void` + `.catch()` to prevent unhandled promise rejections.

### Correct

```typescript
void this.indexerHooks.onIssueChanged(issueId, 'reason').catch((err) =>
  this.logger.error(`Indexer hook failed: ${err.message}`, err.stack),
);

void this.notificationsDispatch.dispatch({ ... }).catch((err) =>
  this.logger.error(`Notification dispatch failed: ${err.message}`, err.stack),
);
```

### Wrong

```typescript
// Missing .catch() — unhandled promise rejection if dispatch throws
this.notificationsDispatch.dispatch({ ... });

// Missing void — floating promise without explicit intent
this.indexerHooks.onIssueChanged(issueId, 'reason');
```

## Tracked Fire-and-Forget — `BackgroundTasks`

Raw `void … .catch()` is correct for work nobody needs to wait on (e.g. an S3
delete). But fire-and-forget that **writes to the DB** — event-listener side
effects, `notificationsDispatch.dispatch()`, activity records — must be
*drainable*, or it races shutdown (a deploy drops the in-flight write) and racing
integration teardown (a late write FK-violates the next test's `TRUNCATE`).

For those, register the work with `BackgroundTasks` (`@/common/background`, a
`@Global()` provider) instead of a bare `void`:

```typescript
// Service-level fire-and-forget — replaces `void this.x().catch(h)`
this.background.run(
  () => this.notificationsDispatch.dispatch({ ... }),
  (err) => this.logger.error(`Dispatch failed: ${err.message}`, err.stack),
);
```

NOTE: domain-event `@OnEvent` listeners do NOT use `BackgroundTasks` — the
domain-events processor awaits them end-to-end (`emitAsync`), and their
failures must propagate for the outbox retry (see the Domain Events section
above). `BackgroundTasks` is for service-level fire-and-forget only.

`onModuleDestroy` drains in-flight tasks (bounded) for graceful shutdown;
integration tests drain via `whenIdle()` before truncating. See
`code-review-reports/integration-test-flakiness.md`.

## Rules

- NEVER leave a promise floating without `void` prefix and `.catch()` handler
- DB-writing fire-and-forget (events, dispatch, activity) MUST go through `BackgroundTasks.run`/`track`, not a bare `void`, so it can be drained
- Services that use fire-and-forget MUST have a `private readonly logger = new Logger(ClassName.name)` field
- If you need the result, use `await` instead
- Async methods mocked in tests MUST use `.mockResolvedValue()` — see `nestjs-error-handling.md` (otherwise the `.catch()` chain above throws `TypeError`)