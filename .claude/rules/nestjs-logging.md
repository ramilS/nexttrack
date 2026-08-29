# Logging for Incident Investigation

Business-logic logging exists to reconstruct **what happened on prod** after the
fact: who did what, to which entity, with what data, and where it failed. Logs
are written for the engineer reading them at 03:00 during an incident, not for
the happy path demo.

## Use `AppLogger`, not the bare NestJS `Logger`

`AppLogger` (`@/common/logging/app-logger`) wraps the framework logger and:

- auto-prefixes every line with the active request context
  `[requestId][user:userId]` from AsyncLocalStorage — no need to thread ids
  through call sites;
- renders structured `key=value` fields for grep-friendly triage.

```typescript
import { AppLogger } from '@/common/logging/app-logger';

export class IssuesService {
  private readonly logger = new AppLogger(IssuesService.name);
}
```

Replace existing `private readonly logger = new Logger(X.name)` with `AppLogger`.
The API is the same for `log/warn/debug/verbose`; `error` takes the caught error
as its 2nd arg so the stack is preserved:

```typescript
this.logger.log('Issue created', { issueId, projectId, type });
this.logger.warn('Quota exceeded', { projectId, limit });
this.logger.error('Webhook delivery failed', err, { webhookId, status });
```

## What to log (and at which level)

| Level | Use for |
|---|---|
| `log` | Successful state mutations (create/update/delete), external-system calls succeeding, lifecycle/boot events, job start/finish. The audit trail. |
| `warn` | Recoverable anomalies / security signals: auth failures, blocked-account access, reuse detection, fallbacks taken, missing-but-tolerated data, retries. |
| `error` | Unexpected failures — always pass the caught error for the stack. |
| `debug` | High-volume detail useful only when actively debugging (query shapes, cache hit/miss). Off in prod by log level. |

### Always log

- **State mutations** — create/update/delete of any aggregate: entity id(s),
  actor is implicit via context. On **update**, log *which fields changed* and
  their new values (see "Log the data that caused the failure" below).
- **Security events** — login ok/failed, blocked/deleted-account attempts,
  token reuse, logout-all, invite accept, permission/role changes, SSO link.
  Include `ip` here (the one place raw IP is allowed).
- **External-system boundaries** — webhook/telegram/email/OpenSearch/S3
  calls: the target id and outcome. These fail independently of our DB and are
  the usual incident root cause.
- **Event delivery** — outbox enqueue/dispatch, listener side effects, retries,
  and final FAILED transitions.
- **Background jobs** — processor start, finish (with counts), and failure. ALS
  context is **lost across the BullMQ boundary**, so log `requestId`/`userId`
  from the job payload explicitly inside processors.

### Don't log

- Pure read/query/getter hot paths at `log` level — use `debug` if useful at
  all, else nothing. Don't turn list endpoints into log spam.
- Anything already covered by the global `AllExceptionsFilter` (it logs every
  thrown exception once). Don't double-log an error you're rethrowing unchanged.

## Log the data that caused the failure

The point of mutation logging is to explain *why* given input blew up (NPE, FK
violation, validation). Log the **identifying inputs and changed fields** at the
start of the operation (or in the catch), so a stack trace can be tied to the
data that produced it.

```typescript
// Good — the changed fields are recoverable from the log when this update NPEs
async update(id: string, dto: UpdateIssueInput) {
  this.logger.log('Updating issue', {
    issueId: id,
    fields: Object.keys(dto),
    statusId: dto.statusId,
    assigneeId: dto.assigneeId,
  });
  ...
}
```

Log keys/values, not whole DTOs blindly — and never the PII fields below.

## PII policy (hard rule)

See `nestjs-security.md`. In logs:

- **IDs only** — log `userId` (UUID), `issueId`, `projectId`. **Never** log raw
  `email`, names, passwords, tokens, or secrets.
- **IP** only on security events (login, token reuse, SSO) where it is
  investigation-critical. Not on ordinary mutations.
- Rich text / file contents / DTO blobs that may contain user PII: log their
  shape (`Object.keys`, length, ids), not the content.

## Don't break async-safety or behavior

- Adding logs must not change control flow. Fire-and-forget rules
  (`nestjs-async-safety.md`) still apply — a log line is not error handling.
- In `@OnEvent` listeners, still **rethrow** so the outbox retry fires; a log is
  not a substitute for propagation.
