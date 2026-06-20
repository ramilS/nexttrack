# External Audit — NextTrack (2026-06-24)

External expert review: architecture, backend code quality, security, data layer & performance,
frontend, testing, DevOps/config. Every finding was verified against source by a dedicated
reviewer per dimension; plausible-but-wrong findings were filtered out.

## Verdict

**Near reference-grade.** The invariant-critical parts are already exemplary:
outbox/event delivery (every publish inside the mutation `tx`, complete listener
idempotency), transactional + OCC patterns, auth (httpOnly cookies, SHA-256 refresh +
rotation + reuse→logoutAll, per-request user re-validation), module boundaries
(Reader/Writer facades, zero `forwardRef`/circular deps), type safety (the "2 `as any`"
are gone — only the sanctioned `prisma/json.ts` accessor remains), and a
reference-grade integration harness (Testcontainers, deterministic drain-before-TRUNCATE,
concurrent exactly-once claim test).

The gap to "эталонный" is concentrated in: **3 deploy/config breakages**, **1 silent
real-time bug**, **1 silent data-divergence bug**, a **search-performance cliff**, the
**unenforced coverage gate**, and decomposition of **3 oversized units**.

Severity legend: **CRITICAL** = broken/insecure in prod · **HIGH** = bites on deploy or hides regressions · **MEDIUM** = correctness/maintainability · **LOW** = polish.

---

## CRITICAL

### CR-1 — Prod compose Redis is unreachable (service `redis` vs URL host `valkey`)
`infra/docker-compose.prod.yml:32` names the service `redis:` (DNS name `redis`), but
`.env.prod.example:28` sets `REDIS_URL=valkey://:CHANGE_ME@valkey:6379` (host `valkey`,
doesn't resolve). Compose also requires `VALKEY_PASSWORD` (`:35,:39` `${VALKEY_PASSWORD:?}`)
while the env example documents `REDIS_PASSWORD`. A fresh `cp .env.prod.example .env.prod`
boot fails the required-var guard immediately; BullMQ + RedisService can't connect.
**Fix:** `REDIS_URL=valkey://:<pw>@redis:6379`, rename `REDIS_PASSWORD`→`VALKEY_PASSWORD`,
keep the embedded password in sync. (Or rename the prod service to `valkey` to match dev.)

### CR-2 — Real-time socket invalidation never matches current query keys (live updates silently dead)
`apps/web/lib/hooks/use-realtime.ts` invalidates hand-written keys that don't match the
exported query-key factories (TanStack prefix-matches from index 0):

| Event | realtime key | actual factory key | match |
|---|---|---|---|
| issue list | `['issues','list',projectKey]` | `issueKeys.list=['issues','list',{params}]` — *and the list uses `useSearch`, not this hook* | ✗ |
| board | `['board',projectKey]` | `boardKeys=['boards',…]` | ✗ (root differs) |
| comment | `['comments',issueId]` | `commentKeys.list=['comments','list',issueId]` | ✗ |
| sprint | `['sprints',projectKey]` | `sprintKeys.list=['sprints','list',boardId,status]` | ✗ |
| issue detail | `['issues','detail',projectKey]` | `issueKeys.detail=[…,number]` | ✓ |

With `refetchOnWindowFocus:false` + `staleTime:30s`, board/comments/sprints/issue-list do
**not** live-update from sockets — only issue detail does; boards survive only via an
independent `refetchInterval`. **Fix:** import the exported factories (`boardKeys.all`,
`commentKeys.list(issueId)`, `searchKeys.all`, `sprintKeys.all`, `issueKeys.all`) in
`use-realtime.ts`; add a test asserting a socket event invalidates the matching key.

### CR-3 — `.env` `VALKEY_URL` is dead; app silently uses the localhost default
`.env:23` sets `VALKEY_URL`, but `apps/api/src/config/redis.config.ts:12` reads
`REDIS_URL` (`.default('redis://localhost:6379')`). The local override is ignored — works
by coincidence locally, latent footgun. **Fix:** rename `VALKEY_URL`→`REDIS_URL` in `.env`.

---

## HIGH

### H-1 — `IssuesService.bulkUpdate` skips ALL domain-event side effects (silent data divergence)
`apps/api/src/modules/issues/issues.service.ts:510-515` (repo `:910`). Single `update()`
publishes `issue.updated` inside the tx → activities, notifications, **ES reindex**,
workflow automation, AI-docs. `bulkUpdate()` does a transactional `updateMany` but
publishes **no event** and triggers **no indexer hook**. Every bulk status/assignee change:
issues go **stale in Elasticsearch** (the issue list is ES-backed → users see old data),
no activity log, no assignment notifications, no `ON_STATUS_CHANGE` rules. The `_userId`
param is currently unused. **Fix:** publish one `issue.updated` per affected id inside the
bulk tx (reuse resolved old/new values), or at minimum fire `indexerHooks.onIssueChanged`
per id via `BackgroundTasks` after commit. Add an integration test asserting N outbox rows.

### H-2 — `pg_trgm` enabled but NO trigram index exists — every substring search is a seq scan
`schema.prisma:8` declares `pg_trgm`; no migration creates a single GIN trgm index. Hot
ILIKE paths scan unindexed columns: `project-members.repository.ts:107,146-147,253-254`
(`users.name/email` on every member-picker / mention keystroke — scans all users),
`issues.repository.ts:453,476` + `sprints.repository.ts:288,318` (`title`),
`projects.repository.ts:240` (`key`). A leading-wildcard ILIKE can't use a B-tree.
**Fix:** raw-SQL migration adding `gin (col gin_trgm_ops)` on `users.name`, `users.email`,
`issues.title` (and others as needed). The extension is paid for at boot — currently pure
overhead. Either index or drop it.

### H-3 — Unbounded report queries (OOM risk)
`time-logs.repository.ts:237-336` (`findReportLogs`/`findUserReportLogs`) and
`time-reports.service.ts:41,96` apply only a date filter — **no `take`**. A wide range on a
busy project pulls the whole set into memory and into a CSV. Also missing
`@@index([issueId, date])` on `TimeLog` for the project-scoped report join. **Fix:** hard
cap + "truncated" signal (or stream the CSV); add the index.

### H-4 — Unbounded board read
`issues.repository.ts:441-483` (`findManyForBoard`/`Raw`) selects **all** active issues in a
project with full include, no `take`. The new composite index fixes sort latency, not
volume — a 5k-issue project hydrates 5k cards per board open. **Fix:** cap (e.g. 1000 + a
"filter" UX) or paginate per column; at minimum document the scaling limit.

### H-5 — Node engine declaration wrong and unenforced
`package.json:23` `engines.node: ">=18"`, but stack is NestJS 11 + Prisma 7 (needs ≥20.9)
+ Next + `node:22-alpine` in Docker. No per-app engines, no `engine-strict`, no `.nvmrc`.
A Node 18 install passes the gate then fails at `prisma generate`/runtime. **Fix:** root
`engines.node: ">=22"`, add `.npmrc` `engine-strict=true`, add `.nvmrc` `22`.

### H-6 — Coverage gate is documented but NOT enforced (and web is under-target)
`apps/api/jest.config.ts` has **no `coverageThreshold`** and `test:unit` never passes
`--coverage` → the "80% minimum" rule is unmeasured on the backend, free to rot.
`apps/web/vitest.config.ts:31` enforces **70%** (below the 80% rule) and excludes
`providers/**` — exactly where the untested `AuthSyncProvider` lives. CI calls `test:unit`,
not `test:coverage`. **Fix:** add `coverageThreshold.global` to jest, run `--coverage` in
the gate; raise web to 80 and stop excluding `providers/**`.

### H-7 — Prod compose `up` runs an API against an unmigrated DB
API container `CMD ["node","dist/main"]` runs no migration; `docker-compose.prod.yml`'s
`api` service has no migrate step — only the manual `deploy-init.sh` runs
`prisma migrate deploy`. So the documented `docker compose -f docker-compose.prod.yml up -d`
starts against an unmigrated schema. **Fix:** one-shot `migrate` init container (or an
entrypoint running `migrate deploy` before `node dist/main`), or document that
`deploy-init.sh` is the only supported path.

### H-8 — `proxy.ts` is dead code masquerading as Next middleware
`apps/web/proxy.ts` exports `proxy()`+`config.matcher` and has tests, but there is **no
`middleware.ts`** (Next only runs `middleware.ts`). Per CLAUDE.md the app gates auth
React-side. The file never executes, and its logic (`cookies.get('access_token')`
presence) is unsound for httpOnly cookies — a trap for the next dev. **Fix:** delete
`proxy.ts` + `proxy.test.ts`.

### H-9 — Hardcoded Russian strings in an English app
`apps/web/components/issues/issue-detail.tsx:325,329` — "Скопировать ссылку" / "Скопировать
ключ и название". No i18n layer. **Fix:** "Copy link" / "Copy key and title".

### H-10 — Soft-passing & self-skipping e2e tests (false green)
`apps/e2e/19-dashboards.spec.ts:20-69` and `17-sprints.spec.ts:58-67` wrap the entire
assertion in `if (await x.isVisible().catch(()=>false))` → pass green having asserted
nothing. Runtime `test.skip()` on data conditions in `24/25/26-api-*.spec.ts` and
`17-sprints.spec.ts:38` silently disable themselves when fixtures are missing. **Fix:**
seed prerequisite state, assert unconditionally; make setup guarantee fixtures.

### H-11 — Documented hard-constraint auth behaviors untested
Multi-tab logout sync (`BroadcastChannel('next-track:auth')` → `AuthSyncProvider` clears
store) has **zero** coverage (`use-auth.test.tsx` mocks `publishAuthEvent` away). The
`useLogout` "await `authApi.logout()` before redirect" rule (documented bug: bare
`location.href` aborts the logout fetch) is untested at every tier. Both are documented
hard constraints that can regress silently. **Fix:** unit-test `AuthSyncProvider` receipt;
unit-test `useLogout` await ordering; add a UI logout e2e flow.

---

## MEDIUM

### Architecture
- **A-M1** `health.controller.ts:42-188` injects `PrismaService`/`RedisService`/`ElasticsearchService`
  and runs `$queryRaw\`SELECT 1\``, latency timing, and status aggregation in the controller —
  the one controller touching Prisma directly. Extract a `HealthService`.
- **A-M2** `sso/sso.service.ts:50` — **12 constructor deps** (OAuth state + provider dispatch +
  user provisioning + invite consumption + token issuance). Extract `SsoProvisioningService`
  (lines 226-424); delegate token issuance to a shared issuer (see A-M3). Most security-sensitive
  module — this is a testability cliff.
- **A-M3** Token-issuance logic is **duplicated** across `auth.service.ts:316-350` and
  `sso.service.ts:426-473`, with a drift (auth uses `sha256Hex()`, SSO inlines the digest).
  The refresh-token mint is a documented hard constraint — it must have **one owner**
  (`TokenIssuerService` / `AuthService.issueSession`).
- **A-M4** `issues.service.ts` (9 deps) docstring (`:44`) references `IssueHierarchyService`
  that **does not exist** — re-parenting is inline in `resolveUpdatePatch`. Either create it or
  delete the comment; consider extracting watcher management (`:532-546`, pure repo pass-throughs).
- **A-M5** `dashboards.repository.ts` (666 lines) conflates Dashboard/Widget CRUD with a
  cross-aggregate reporting read-model over issues/activities/time-logs/sprints (`:308-665`),
  reading 5 other modules' tables directly. Split into `DashboardsRepository` +
  `DashboardReportingRepository`.
- **A-M6** Boundary-rule doc drift: an undocumented 7th Reader (`KnowledgeBaseReader`) + a whole
  tier of cross-module-injected repos (`Projects`, `ProjectMembers`, `Activities`, `Versions`,
  `RefreshTokens`, `Invites`, `CustomFields`) not covered by `nestjs-module-boundaries.md`.
  Reconcile the rule with reality.
- **A-M7** `auth.controller.ts:117-134` (logout does `jwt.verify`+jti extraction) and
  `sso.controller.ts:73-87` (open-redirect allow-list check) carry security logic that belongs
  in services. Stale "Pilot" docstring in `issues.repository.ts:93-97` (now 1067 lines).

### Backend correctness
- **B-M1** `comments/events/comment-events.listener.ts:77` — notification `issueKey` is set to
  the raw **project UUID** (`\`${event.projectId}\``); `CommentCreatedEvent` lacks `projectKey`/
  `number`. Emails/in-app render a UUID instead of `PROJ-123`. Plumb `projectKey`+`number`.
- **B-M2** `comment-events.listener.ts:71` dispatches `ActivityType.COMMENT_ADD` where
  `NotificationType` is expected (compiles only by string coincidence). Use `NotificationType.COMMENT_ADD`.
- **B-M3** `custom-field-values.service.ts:104-107,137-139` — `setFieldValue`/`clearFieldValue`
  do 3 sequential writes (upsert/delete → activity → `touchUpdatedAt`) **outside a transaction**;
  a crash leaves a partial save. Wrap in `txService.run` (the create path already does).
- **B-NIT** `sprints.service.ts:317` passes `err.stack` to `logger.error` (wants the error
  object — it extracts `.stack` itself). `:182` is correct.

### Security
- **S-M1** `attachments.service.ts:85,202-207` — persisted MIME is the client-supplied
  `file.mimetype`; no magic-byte sniffing; `image/svg+xml` is allow-listed
  (`attachment-limits.ts:6`). Contained today (download forces `Content-Disposition:
  attachment`, served from S3 origin), but fragile. Sniff the real type (`file-type`), reject on
  mismatch, store the sniffed type; drop/neuter SVG.
- **S-M2** `attachments.service.ts:121-126` — thumbnail presign sets no disposition and serves
  inline with the stored (client-trusted) content-type. Force a safe `ResponseContentType` /
  `Content-Disposition` on the thumbnail path.

### Frontend
- **F-M1** `issue-sidebar.tsx:361-364` — mute button conditional class is a no-op (both ternary
  branches `text-muted-foreground`); muted state shown only by icon. Differentiate or drop the `cn`.
- **F-M2** Missing `aria-label` on icon-only buttons: `header.tsx:73`, `project-list.tsx:107`,
  `members-list.tsx:129`, `issue-detail.tsx:319,341` (base-ui does not auto-label these).
- **F-M3** Inline `toLocaleDateString()` bypasses shared `RelativeTime` in `admin/user-list.tsx:194`,
  `admin/invite-list.tsx:72`, `profile/connected-accounts.tsx:105`.
- **F-M4** `board-settings-dialog.tsx:253-270` — `handleSave` fires two independent mutations;
  if columns fail, the board-name change already persisted (partial save). Sequence or single endpoint.

### Data
- **D-M1** `Issue.parent` (schema:406) has no `onDelete` → defaults to `Restrict`, inconsistent
  with `Comment.parent` (cascade). Decide policy explicitly (likely `SetNull` for sub-issues).
- **D-M2** `IssueLink` unique `@@unique([sourceIssueId,targetIssueId,type])` (schema:605) is
  one-directional → symmetric types (`RELATES_TO`) allow reverse-duplicate rows. Canonicalize
  ordering for symmetric types.
- **D-M3** `findDueIssuesForNotification` (issues.repository.ts:960-970) uses `include` (whole
  row incl. heavy `description` JSON) where a nested `select` of ~7 fields suffices.
- **D-M4** Comment replies (`comments.repository.ts:99-111`) fetched unbounded per top-level
  comment. Acceptable for typical threads; lazy-paginate if deep threads expected.

### Testing
- **T-M1** ~8 tautological delegation unit tests assert only that a mock was called with the
  test's own input where the method has real logic: `versions.service.spec.ts:106` (ordinal
  computation untested), `comments.service.spec.ts:236` (admin-delete branch), `projects.service.spec.ts:116`,
  `projects-members.service.spec.ts:225/231`, `issues.service.spec.ts:387`,
  `custom-field-values.service.spec.ts:311`. Assert computed output/branch, not echoed input.
- **T-M2** e2e brittleness: CSS-class selectors (`.tiptap`, `span.truncate`) in `07-comments`/
  `13-mentions`; **20× `waitForTimeout` hard sleeps** (9 in `13-mentions`). Replace with
  `waitFor`/`expect.poll` and `data-testid`.
- **T-M3** e2e hardcoded admin creds (`global-setup.ts:245`) contradict the "read from
  seed-dev.ts" rule; on drift the reindex login fails to a `console.warn` → empty-list cascade.

### DevOps
- **DO-M1** `docker.yml` push trigger disabled → Dockerfiles not exercised on PRs (the
  `prisma.config.ts` build-exclude gotcha could regress unseen). Add a `docker build` (no push) PR job.
- **DO-M2** API Dockerfile prod `COPY` lacks `--chown=node:node` (web does it right).
- **DO-M3** `minio/minio:latest`, `mailhog:latest`, `nginx:alpine`, `certbot` unpinned in both
  compose files (postgres/valkey/ES/node are pinned). The MinIO `SignatureDoesNotMatch` gotcha
  makes floating tags risky. Pin them.
- **DO-M4** `OPS_TOKEN` (gates `/internal/metrics`) is in `turbo.json` globalEnv but undocumented
  in any `.env.example` → prod metrics silently 404. Document it.
- **DO-M5** Many `globalEnv` vars (`LOG_LEVEL`, `APP_REQUEST_TIMEOUT_MS`, `OUTBOX_POLLER_ENABLED`,
  `AI_DOCS_*`, `WS_*`, `DATABASE_POOL_*`) undocumented in `.env.example`. Sync examples with the
  `registerAs` schemas (the source of truth).
- **DO-M6** Dev compose bind-mounts stateful DB data into the repo tree (`infra/.docker/volumes/…`,
  gitignored but fragile on macOS). Use named volumes like prod.
- **DO-M7** Both compose files mount the PG volume at `/var/lib/postgresql` (parent), not
  `/var/lib/postgresql/data`. Mount `.../data` or set `PGDATA`.
- **DO-H** (also) Root `test` = `pnpm --filter api test && pnpm --filter web test` bypasses Turbo
  (no cache/parallelism, diverges from `turbo run test`). `test:unit` is cacheable but declares no
  `inputs`/`outputs` and the ~120-var `globalEnv` over-invalidates every task's cache. Scope env per-task.

---

## LOW
- `workflow-form-dialog.tsx:148-150` raw hex instead of `COLOR_PRESETS`; `use-attachments.ts`
  reimplements toast+invalidate instead of `useMutationWithToast`; `useCreateIssue` broad
  `issueKeys.all` invalidate (redundant with the search-cache prepend).
- `custom-field-values.service.ts:226` reads via repo where `IssuesReader.findProjectIdById` exists.
- ES `buildSort` falls through `FIELD_MAP[x]||field` (es-query-builder.service.ts:331-336) — restrict
  to the allow-list for clean validation errors (not injection).
- URL custom-field rendered as `<a href>` without a client-side `^https?://` guard
  (field-renderer.tsx:200; backend already rejects non-http at write time).
- `tiptapContentSchema` is `z.any().refine(type==='doc')` (packages/shared/.../tiptap.schema.ts:30) —
  tighten to a recursive node allow-list (not exploitable today: read-only ProseMirror render,
  Link `isAllowedUri` blocks `javascript:`).
- No `pre-commit`/`commit-msg` husky hooks (push gate only); `pnpm@9.0.0` pinned in 3 places;
  Jaeger commented out in dev compose but referenced in `.env.example`; `pnpm audit` is
  `continue-on-error`.

---

## What is already exemplary (keep / showcase)
- **Outbox/event architecture** — every domain publish inside the mutation `tx`; `publish(event, tx)`
  keeps `tx` required; zero rogue `EventEmitter2` domain emits.
- **Listener idempotency** — `idempotency.runOnce(\`${eventId}:activity\`)` + `dedupeKey` everywhere;
  the single at-most-once exception (`workflowEngine.executeRules`) is the documented one.
- **Auth** — httpOnly cookies only, bcrypt rounds 12, SHA-256 refresh + rotation + atomic
  `revokeIfActive` (closes the concurrent-refresh race) + reuse→logoutAll, per-request user
  re-validation (deleted/blocked locked out on every request), generic `INVALID_CREDENTIALS`.
- **SSO** — PKCE S256, opaque single-use state in Redis, one-time finalize code (no tokens in URL),
  server-side open-redirect guard + client double-guard, secrets encrypted at rest + masked.
- **Module boundaries** — Reader/Writer facades, zero `forwardRef`, zero circular deps, no service
  injects `PrismaService` (except the health controller, A-M1).
- **Type safety** — the "2 `as any`" are gone; only `prisma/json.ts asJson<T>()` remains (sanctioned).
- **Migrations** — `workflow_relational` backfill with an orphan-guard `RAISE EXCEPTION` is reference-grade.
- **Data layer** — thorough composite indexing tied to access patterns, keyset pagination, no N+1,
  durable BullMQ reindex queue with retry + `refresh:'wait_for'`, keyset reindex.
- **Frontend** — single axios client with queued 401-refresh + token-versioning, per-domain `*.api.ts`,
  `@repo/shared` response types (no drift), correct base-ui usage, optimistic updates with rollback,
  the ES-lag read-your-writes search-cache prepend, semantic design tokens, `AsyncContent`/`ConfirmDialog`.
- **Integration harness** — Testcontainers, on-demand ES, deterministic drain-before-TRUNCATE
  (eliminates the async-listener/teardown race), deadlock retry, bootstrap parity guarded by a spec,
  3-concurrent-poller exactly-once claim test. The axios interceptor test exercises the real handlers.
- **Typed config** — every domain `registerAs`+Zod, zero `ConfigService.get('STR')`, production
  placeholder-rejection guards, `envBoolean` avoiding the `z.coerce.boolean()` trap.
- **Observability** — OTel imported pre-DI, ParentBased sampler honoring restored traceparents,
  fail-open, span flush on shutdown; k8s-shaped live/ready probes; `/internal/metrics` behind a
  timing-safe `OpsAuthMiddleware`.
- **Test discipline** — factories everywhere, async mocks correct, zero `as any` Prisma fakes, no
  snapshot/only/skip abuse; the genuinely hard behaviors (outbox at-least-once, OCC 5-branch merge,
  refresh reuse) tested non-tautologically at the right tier.
