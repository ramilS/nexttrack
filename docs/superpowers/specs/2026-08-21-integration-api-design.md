# Integration API — Design

**Date:** 2026-08-21
**Status:** Approved (design), pending implementation plan
**Scope:** Enable external systems to create issues in NextTrack over HTTP without a browser session.

## 1. Problem

NextTrack has no way for a machine to file an issue. The create endpoint
(`POST /api/projects/:key/issues`) exists, but its only authentication path is a
browser session: `/auth/login` returns tokens exclusively in httpOnly cookies, the
access token lives 15 minutes, and renewal requires the refresh cookie with rotation
and reuse-detection. An external service would have to impersonate a browser —
log in with a human's password, scrape `Set-Cookie`, maintain a cookie jar.

There is no inbound webhook receiver either. The `webhooks` module is outbound only
(`ProjectWebhook` → external URL), and `telegram` only delivers notifications.

The immediate consumer is a separate error-tracking product (a Sentry analogue) the
author is building. Because NextTrack is also deployed by other people, the contract
must be usable by callers we know nothing about — a Telegram bot, a CI job, a cron
script, a relay in front of a third-party monitor.

## 2. Core decision

**NextTrack publishes a contract; callers conform to it. NextTrack models no
integrations and knows no providers.**

Consequences:

- **No new endpoints.** The existing REST API becomes reachable by machines.
- **No provider adapters, ever.** No `sentry/` module, no per-service verification code.
- **No field-mapping configuration.** No expression language, no per-integration
  payload transformation. Callers send our shape.
- **No provider registry.** Nothing in the schema names an external system.

A caller that cannot speak our format (e.g. Sentry itself) is adapted **outside this
repository** — by a small relay the deployer runs, or by a standalone connector. Our
code contains zero lines about any specific external product.

### Why the existing API suffices

`@ProjectAuth()` composes `JwtAuthGuard → RolesGuard → PermissionGuard` plus
`ProjectContextInterceptor`. `JwtAuthGuard` extends `AuthGuard('jwt')`. Passport
accepts a strategy list, so the change is one line:

```ts
export class JwtAuthGuard extends AuthGuard(['jwt', 'api-key']) {
```

The new strategy places a principal in `req.user`; `PermissionGuard` then applies the
same per-project permission checks it already applies to humans. Machine authorization
reuses the human model wholesale — there is no second set of rules that could drift
from the first.

## 3. Principal model

A machine caller is a real `User` row marked as non-human. This matches how the
ecosystem solves it: GitLab auto-creates a bot user per access token and additionally
offers an explicit service-account type that cannot sign in and is displayed
distinctly in membership lists; GitHub types the actor as `User` or `Bot`. YouTrack has
no such type — bot accounts are ordinary accounts by convention, and consequently
YouTrack cannot filter them out of pickers for you.

Rejected: making `Issue.reporterId` nullable. No comparable product does this, and the
blast radius covers every mapper and every UI that renders a reporter.

Rejected: attributing machine actions to the human who created the key. The activity
feed would state that a person filed an issue they never saw, and notifications would
route to them.

### 3.1 `User.kind`

```prisma
enum UserKind {
  HUMAN
  SERVICE

  @@map("user_kind")
}
```

`User.kind UserKind @default(HUMAN)` — the default covers existing rows, so no backfill.

- Login is refused by an explicit `kind === SERVICE` check in `AuthService.login` and in
  the auth strategies. **Not** by setting `isBlocked`: that flag means "an admin blocked
  this person" and is surfaced as `ErrorCode.USER_BLOCKED`; reusing it would destroy the
  audit distinction between a banned human and a machine.
- `passwordHash` is null and `hasPassword` is false.
- Email is synthetic: `svc.<shortId>@integrations.invalid`. `.invalid` is reserved by
  RFC 2606 and is guaranteed non-routable. Service users are never notification
  recipients (see 5.3), so this is defence in depth rather than a live requirement.

### 3.2 One service user per key

Each `ProjectApiKey` owns exactly one `SERVICE` user, named after the key. The activity
feed then reads "MyTracker created NT-14" rather than an anonymous "Integration".
Rotating a key replaces `tokenHash` on the same row, so the user — and therefore all
historical attribution — survives rotation.

### 3.3 Membership and the `Integration` role

The service user is a `ProjectMember`. This is not decoration: `ProjectMember.roleId` is
the only place project permissions live, so without membership the principal has no
rights and `PermissionGuard` denies everything. Membership also scopes a key to a single
project — a stolen credential cannot write elsewhere.

A new system role, `Integration`, id `00000000-0000-0000-0000-000000000006`,
`isSystem: true`, with exactly:

- `Permission.ISSUE_READ`
- `Permission.ISSUE_CREATE`
- `Permission.COMMENT_CREATE`

`COMMENT_CREATE` is required by the recurrence flow in 5.2 — a caller that receives an
existing issue on a dedup hit posts its own "seen again" comment.

The seeded `Reporter` role is deliberately not reused: it also grants article and
time-tracking permissions that an integration has no use for.

Membership is created and removed by the key lifecycle, never by hand. Issuing a key
adds the member; revoking the key removes it. `ProjectMembersService.removeMember`
rejects removal of a `SERVICE` member that still has a live key, with a `ConflictError`
directing the admin to revoke the key instead.

The point is not that the member must never disappear — after revocation the
integration is intentionally dead, and its past issues keep a non-member reporter
exactly as issues filed by a departed colleague do. The point is that removal must go
through the key. This mirrors GitLab's invariant that a token's bot user cannot be
removed from its project: a member removable by hand means someone breaks a live
integration from the members screen, with no indication that anything stopped working.

## 4. Data model

### 4.1 `ProjectApiKey`

```prisma
model ProjectApiKey {
  id          String    @id @default(uuid())
  projectId   String    @map("project_id")
  userId      String    @map("user_id")
  name        String    @db.VarChar(100)
  prefix      String    @db.VarChar(16)
  tokenHash   String    @unique @map("token_hash")
  expiresAt   DateTime? @map("expires_at")   @db.Timestamptz(3)
  lastUsedAt  DateTime? @map("last_used_at") @db.Timestamptz(3)
  revokedAt   DateTime? @map("revoked_at")   @db.Timestamptz(3)
  createdById String    @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User    @relation("ApiKeyPrincipal", fields: [userId], references: [id])
  createdBy User    @relation("ApiKeyCreator",  fields: [createdById], references: [id])

  @@index([projectId])
  @@map("project_api_keys")
}
```

- The stored value is the SHA-256 hex of the raw key, not bcrypt. A 32-byte random
  token already carries enough entropy that a slow hash buys nothing — the same
  reasoning already applied to `RefreshToken.token`.
- Lookup is by `tokenHash` (unique), so it is O(1) and no prefix lookup is needed.
  `prefix` exists only so the UI can identify a key after its secret is no longer
  displayable.
- The raw key is shown to the user once, at creation, and never stored.

### 4.2 `Issue.dedupKey`

```prisma
model Issue {
  dedupKey String? @map("dedup_key") @db.VarChar(200)
}
```

An opaque, caller-supplied string, unique per project. NextTrack attaches no meaning to
it: an error tracker puts a group id there, a Telegram bot a message id, a monitor an
incident id.

The uniqueness constraint is a **partial** index created in raw SQL:

```sql
CREATE UNIQUE INDEX issues_project_dedup_key_unique
  ON issues (project_id, dedup_key)
  WHERE deleted_at IS NULL;
```

Two properties matter here:

1. Postgres treats NULLs as distinct in a unique index, so the thousands of
   human-created issues with no key never collide. A partial index is not needed
   for that.
2. It **is** needed for soft delete. A full index would let a deleted issue block its
   key permanently — the recurring error could never open a new issue again, with no
   way to fix it from the UI. With `WHERE deleted_at IS NULL`, deleting an issue frees
   its key.

The accepted trade-off: if a user deletes an issue as noise while the source keeps
firing, new issues appear. Silencing a source is the caller's concern, not ours —
consistent with NextTrack knowing nothing about callers.

Lookup queries must filter `deletedAt: null` to match the index.

### 4.3 Migrations

| # | Contents | Kind |
|---|---|---|
| 1 | `user_kind` enum, `users.kind` column | schema |
| 2 | `issues.dedup_key` column, partial unique index | schema + raw SQL |
| 3 | `project_api_keys` table, `Integration` role insert | schema + raw SQL (data) |

`prisma migrate deploy` does not run seeds, so the `Integration` role is inserted twice
over: idempotently (`ON CONFLICT DO NOTHING`) in migration 3 for already-deployed
instances, and in `prisma/seed.ts` (plus `seed-dev.ts`) for fresh installs. Without the
migration insert, an existing production instance cannot issue a key at all — the role
would not exist.

## 5. Request flow

### 5.1 `ApiKeyStrategy`

Header: `X-Api-Key`. Not `Authorization: Bearer` — that is already the JWT extractor's
input, and sharing it would make the JWT strategy fail loudly on every machine request.

Written by hand: a passport `Strategy` subclass with a single `authenticate` method,
roughly 25 lines. **Rejected:** `passport-headerapikey`. The project's own rule is not
to add a runtime dependency for what a couple of dozen lines of local code solve, and
an authentication path is the last place to widen the dependency surface.

Validation order:

1. Hash the presented key; look up `tokenHash`.
2. Reject if not found, `revokedAt` set, or `expiresAt` past.
3. Load the principal; require `kind === SERVICE`, not soft-deleted, not blocked.
4. `setRequestUserId(user.id)` so `AppLogger` prefixes machine requests with the
   principal, exactly as it does for humans.

There is no timing side channel on the secret: comparison happens against a hash in the
database, never against the raw key.

`lastUsedAt` is updated through `BackgroundTasks.run` (a DB write must be drainable —
a bare `void … .catch()` races shutdown and integration-test truncation) and at most
once per minute per key. A synchronous update would add a round-trip to every machine
call, and an unthrottled one turns 600 requests/minute into 600 UPDATEs against a
single row for a field a human reads once a month.

### 5.2 Deduplication

`CreateIssueDto` gains an optional `dedupKey: string` — trimmed, 1..200 chars.

Check-then-insert is a race: two concurrent requests carrying the same key both miss
the lookup and both attempt the insert. The real guard is the unique index. The project
forbids catching P2002 **inside** a transaction, because a caught P2002 poisons the
surrounding Postgres transaction. The flow therefore is:

1. Fast path — look up `(projectId, dedupKey, deletedAt: null)` outside any transaction.
   Hit → return the existing issue.
2. Create inside the existing transaction, unchanged.
3. If P2002 escapes the transaction, the transaction has already rolled back in full —
   including its outbox event, so no issue and no event. Re-query outside it and return
   the existing issue.

Nothing continues inside a dead transaction, so nothing is poisoned.

The global exception filter maps P2002 to `409 CONFLICT` with the message "A record
with this value already exists". The dedup handling must run before that filter sees
the error, or a routine recurrence surfaces as an opaque conflict.

**On a dedup hit we do not decide what happens next.** The caller receives the existing
issue and chooses: stay silent, or post a comment, through endpoints that already
exist. NextTrack offers no ignore/comment configuration, because configuring it would
require knowing what the caller's events mean.

Reopening a closed issue is deliberately **not** available to the default role: it
needs `ISSUE_UPDATE`, which `Integration` does not grant (see 3.3), and granting it
would let any integration edit every field of every issue. A deployer who wants
reopen-on-recurrence assigns the service user a custom role carrying `ISSUE_UPDATE`
instead of `Integration`. This is the payoff of using roles as the scope rather than
inventing key scopes: the trade-off is tuned per deployment without us shipping a
second permission model.

### 5.3 Response

- Created → `201`, unchanged.
- Dedup hit → `200`, `{ data: <issue>, meta: { deduplicated: true } }`.

`meta` is already part of the response envelope (it carries pagination), so no new
convention is introduced. Returning two status codes from one handler requires
`@Res({ passthrough: true })`. This is the design's only transport awkwardness, and it
is preferable to answering `201 Created` for a request that created nothing.

Note on notifications: the reporter is **not** auto-added as a watcher on create —
watchers come only from mentions — and every dispatch excludes the actor
(`.filter((id) => id !== event.userId)`). A service principal therefore cannot notify
itself, and no suppression logic is required.

### 5.4 Rate limiting

`ThrottlerModule` registers three named buckets (3/s, 20/10s, 100/min) and all three
apply, keyed by IP. Any real integration would be throttled at 3 requests per second.

`IntegrationAwareThrottlerGuard` extends `ThrottlerGuard`. When
`req.user.kind === SERVICE`, it tracks by **key id** — not IP, or two keys behind one
NAT would fight over a shared bucket — and applies `rateLimitPerMinute` from a typed
`integrationConfig` (default 120). For humans it delegates to `super`, leaving current
behaviour untouched.

A per-key limit column is deliberately not added. Until two integrations with
materially different volumes exist, it is a setting nobody has asked for; it can be
added later as a nullable override without reworking anything.

## 6. Frontend

- **Project settings → API keys** (`apps/web/app/(main)/projects/[key]/settings/api-keys/`),
  gated by `Permission.PROJECT_SETTINGS_UPDATE`, following the existing
  `settings/ai-docs` page. Create (name, optional expiry), list (name, prefix,
  `lastUsedAt`, expiry), revoke. The raw key is displayed once with a copy control and
  an explicit warning that it cannot be shown again.
- **`SERVICE` users are excluded** from the assignee picker, the project members list,
  invite flows, `@`-mention suggestions, and time reports. This is the work YouTrack
  never did, and skipping it puts "MyTracker" in the assignee dropdown.
- **Badge on the actor.** Wherever a `SERVICE` user is rendered as reporter or activity
  actor, an integration badge appears next to the name, following GitHub's app-badge
  convention. Without it, "MyTracker created NT-14" reads as a person.

## 7. Testing

### Unit

- `ApiKeyStrategy`: valid key; revoked; expired; unknown; principal blocked; principal
  soft-deleted; principal `kind: HUMAN` (a key pointing at a human is refused).
- `lastUsedAt` throttling: second call within the window performs no write.
- Dedup service: miss; hit; key belonging to a soft-deleted issue (must be a miss).
- Throttler guard: tracker selection for `SERVICE` vs `HUMAN` principals.
- `removeMember` refusing to remove a `SERVICE` member with a live key.

### Integration

| Case | Why it cannot be a unit test |
|---|---|
| Create with a key → `201`; repeat → `200` + `meta.deduplicated` | exercises guard → permission → service end to end |
| Two concurrent requests, same `dedupKey` → one `201`, one `200`, exactly one row in the DB | this is the race itself; mocked Prisma cannot demonstrate it |
| `Integration` role lacks `ISSUE_UPDATE` → `403` on update | proves the scope is actually bounded by the role |
| `SERVICE` user absent from members list and assignee picker responses | the picker leak described in 6 |
| Key revoked → next request `401` | proves revocation is immediate, not TTL-bound |
| Machine burst above 3 req/s succeeds; above `rateLimitPerMinute` is throttled | proves the named buckets were actually bypassed |

**Harness requirement:** the partial unique index is created by raw SQL in a migration,
and the integration harness builds its schema with `db push`, which skips
migration-only partial indexes. Without the index the concurrency test passes while
proving nothing. The harness must create the index explicitly, as it already does for
other migration-only indexes.

### E2E

Key issuance in project settings: the secret is shown once, is copyable, and after a
reload only the prefix remains; revocation removes the key from the list.

## 8. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Per-provider adapters behind an `IncidentSource` port | An adapter absorbs a contract you cannot change. Here the caller conforms to us, so there is nothing to absorb. Every adapter would be code written for a system we do not need to know about. |
| One ingest endpoint with config-driven payload mapping (expression language, per-integration auth strategies, response templates) | Technically workable, and it would even serve Sentry's `issue-link` button via a response template. Rejected because it makes NextTrack model integrations — the thing this design refuses. It also requires an expression language, sample capture, and mapping preview to be usable at all, which is a feature larger than everything in this spec. |
| A dedicated `POST /projects/:key/incidents` endpoint with a native incident shape | Redundant. Issue creation already exists; a second endpoint that creates issues differs only in authentication, which is now handled by the strategy list. |
| Scopes on the API key, independent of project roles | A second authorization model beside `PermissionGuard`, free to drift from it. The role the service user holds is the scope. |
| Nullable `Issue.reporterId` | No comparable product does it; the blast radius covers every reporter mapper and UI. |
| `isBlocked` as the service-user marker | Destroys the audit distinction between a banned human and a machine. |

## 9. Out of scope

- **Continuous two-way sync with peer trackers (Jira, Trello, Linear).** A different
  class of problem: one issue ↔ one issue, bidirectional, needing status mapping in
  both directions, comment sync, conflict resolution, and background reconciliation
  because webhooks get lost. Creating an issue from a Jira webhook works through this
  API; keeping the two in step does not, and pretending otherwise would ship a feature
  that silently drifts. It needs its own design.
- **Bulk migration.** Already covered by `packages/migrator` and `admin/migration`.
- **Provider connectors of any kind**, including Sentry. Out of the repository by
  design, per section 2.

## 10. To verify during implementation

These are assumptions this design rests on that have not been confirmed against a
running system:

1. `AuthGuard(['jwt', 'api-key'])` strategy ordering, and what Passport returns when
   the first strategy fails — it propagates the last strategy's challenge, which
   affects the error body a caller sees on a bad key.
2. Whether the Elasticsearch indexer selects issue fields explicitly. If it reads the
   model wholesale, `dedupKey` would enter the index and require a reindex for no
   benefit.
3. That `@Res({ passthrough: true })` composes with the `@ApiEnvelope` decorator
   without breaking the generated OpenAPI response schema.
