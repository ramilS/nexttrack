# NextTrack

Issue tracking & project management platform (YouTrack-style). Turborepo monorepo: NestJS API + Next.js 15 web.

## Quick Start

```bash
pnpm install
cd infra && docker compose up -d postgres redis minio elasticsearch
cd ../apps/api && pnpm prisma migrate deploy
pnpm seed:dev          # demo data (Postgres only — see reindex note below)
cd ../.. && pnpm dev   # web :3000, api :3001
```

Admin seed creds are defined at the top of `apps/api/prisma/seed-dev.ts` (`ADMIN_EMAIL` + `PASSWORD` constants, both env-overridable) — read the current values there rather than trusting a copy pasted here.

> ⚠️ After `pnpm seed:dev` you MUST reindex Elasticsearch (admin `POST /api/search/reindex`) or the issue list stays empty — seeding bypasses the indexer. Full detail in **Gotchas**.

## Monorepo Layout

- `apps/api` — NestJS 11 API, Prisma 7 (Postgres), BullMQ jobs, Socket.IO realtime (incl. `modules/ai-docs` — AI-assisted doc updates, see `ai-docs.md`)
- `apps/web` — Next.js 15 (App Router), React 19, TanStack Query, zustand, base-ui shadcn
- `apps/e2e` — Playwright E2E suite (drives the built web+api); `test:e2e` runs here, NOT in `apps/web`
- `packages/shared` — Zod schemas, error codes, permission/role enums shared by both apps
- `packages/migrator` — YouTrack → NextTrack import CLI (`@repo/migrator`: extractors/transformers/loaders)
- `packages/test-support` — Testcontainers helpers (`@repo/test-support`) for API integration tests
- `packages/ui` — shared React primitives (`@repo/ui`) — NOT the web app's UI (that's `apps/web/components/ui`)
- `infra` — docker-compose for local stack (Postgres, Redis, MinIO/S3, ES, Mailhog)

## Common Commands

| Task | Command |
|---|---|
| Run dev stack | `pnpm dev` (from repo root, runs api+web+shared via turbo) |
| API full gate | `cd apps/api && pnpm test` — runs check-types → lint → unit → integration (NOT just tests) |
| API unit / integration only | `cd apps/api && pnpm test:unit` (jest) · `pnpm test:integration` |
| Web full gate | `cd apps/web && pnpm test` — check-types → lint → unit → **build → e2e** (slow, CI-shaped) |
| Web unit only | `cd apps/web && pnpm test:unit` (vitest) |
| E2E | `pnpm test:e2e` from repo root (lives in `apps/e2e`, delegated via `--filter e2e`) |
| Typecheck | `pnpm check-types` (per app, or `turbo check-types` from root) |
| Apply migration | `cd apps/api && pnpm prisma migrate deploy` |
| New migration | `cd apps/api && pnpm prisma migrate dev --name <slug>` |
| Reset DB | `cd apps/api && pnpm prisma migrate reset` |

Always use `pnpm`, never `npm` or `yarn`.

## Where to Look First

Project conventions live in `.claude/rules/*.md`. Index:

> These rule files serve two purposes: (1) domain references to consult when working in each area, and (2) match targets for the code-review workflow's finders (one dimension per file), run via the `/code-review` skill — the finder script is generated per run, so there is no committed `code-review.js` to maintain. When editing them, keep the wrong/correct examples, "acceptable exception" lists, and the `nestjs-anti-patterns.md` numbered items intact — they are the finder's match targets, not filler.

**Backend (NestJS):**
- `nestjs-auth-sessions.md` — token storage, refresh rotation, reuse detection, multi-tab sync
- `nestjs-permissions.md` — `@ProjectAuth`, `@RequirePermission`, atomic permissions model
- `nestjs-zod-validation.md` — every DTO must be Zod-validated via `ZodValidationPipe`
- `nestjs-prisma-enums.md` — never use string literals for Prisma enums
- `nestjs-type-safety.md` — no `as any`/`as unknown as`, use typed accessors
- `nestjs-error-handling.md` — global `@Catch()` filter, `ErrorCode` constants
- `nestjs-typed-config.md` — `registerAs` + Zod, never `ConfigService.get('STR')`
- `nestjs-async-safety.md` — fire-and-forget needs `void ... .catch()`
- `nestjs-module-boundaries.md` — cross-module reads via `<X>Reader` facades; foreign-repo writes only for the allow-listed writer modules
- `nestjs-anti-patterns.md`, `nestjs-test-quality.md`, `nestjs-code-style.md`, `nestjs-security.md`, `nestjs-import-aliases.md`

**Frontend (Next.js + base-ui shadcn):**
- `frontend-shadcn-baseui.md` — base-ui ≠ radix; uses `render` prop, not `asChild`; Select needs `label`
- `frontend-tailwind-shadcn-gotchas.md` — Card ships with `flex flex-col`; use `flex-row` to override
- `frontend-component-patterns.md`, `frontend-design-tokens.md`, `frontend-data-lists.md`

**Feature-specific:**
- `ai-docs.md` — AI-assisted doc updates on issue close: doc-update issue + proposal (recursion guard), apply-on-Done, OCC/staleness merge, pluggable `StructuredLlm` provider (Anthropic/OpenAI-compatible/local), per-project editable prompts

**Cross-cutting:**
- `workflow.md` — process rules (verify real data, run tests before "done", boy scout rule)
- `code-self-review.md` — fresh-context subagent review after writing code (dead code, comments, simplicity, domain naming)

## Architectural Hard Constraints

- Auth tokens are **httpOnly cookies only** — never return `accessToken` in response body.
- Refresh tokens stored as SHA-256 hash in DB, rotated on use; reuse of a revoked token triggers `logoutAll`.
- Source of truth for auth on the client is `/users/me` via `useCurrentUser`, NOT localStorage.
- `User.email` is `@db.Citext` — case-insensitive at DB level; still normalize in Zod (`.trim().toLowerCase()`).
- WebSocket auth is httpOnly-cookie based; refresh fires `auth:token-refreshed` event → socket reconnects.

## Gotchas

- Rate limit on `/auth/login` is 5/5min per IP; repeated test attempts get throttled — restart API to reset the in-memory bucket.
- Mailhog email templates (`apps/api/src/modules/mail/templates/*.hbs`) are read from disk at send time via `__dirname`. They are NOT TypeScript, so `nest build`/`nest start` only copies them to `dist` because of the `assets` entry in `nest-cli.json`. If you add a new template or that entry is dropped, sending mail throws `ENOENT` → a **500 on `/users/invite`** (and silent retry failures on notification emails). Keep `assets: ["modules/mail/templates/**/*.hbs"]` + `watchAssets` in `nest-cli.json`.
- Public guest pages live under `app/(auth)/` and are wrapped by `GuestGuard`, which calls `/users/me`. A guest's 401 → refresh-fail would otherwise bounce them to `/login`; the axios interceptor's `PUBLIC_ROUTE_PREFIXES` allow-list (`/login`, `/accept-invite`) suppresses that. Add any new public guest route (e.g. password-reset) to that list, or it will redirect away before rendering.
- Running a one-off `nest build` while `pnpm dev` (`nest start --watch`) is up wipes `dist` (`deleteOutDir`) out from under the watcher and breaks its incremental recompile — the running server then serves stale code. Restart `pnpm dev` after any standalone build.
- `apps/web` does NOT use Next middleware — auth is React-side via `AuthGuard`/`GuestGuard`.
- The project issue list is **Elasticsearch-backed**: `apps/web/.../projects/[key]/issues` → `IssueList` uses `useSearch` → `GET /api/search`, NOT `GET /projects/:key/issues`. So the list reflects the ES index, not Postgres directly. `pnpm seed:dev` writes only to Postgres and bypasses the indexer hooks, so **issues won't appear in the list until ES is reindexed** (symptom: "issues don't load" with a populated DB). Reindex via admin `POST /api/search/reindex` (`IssueIndexerService.reindexAll()`); `seed-dev.ts` prints a banner with a ready-to-run curl. Both `/search` and `/projects/:key/issues` already use shared `@repo/shared` DTOs — this is a sync issue, not a contract issue.
- **Prisma 7 config lives in `apps/api/prisma.config.ts`, not `package.json`.** The DB URL is set there (`datasource.url`) — the `datasource db {}` block in `schema.prisma` has NO `url`. The seed command is `migrations.seed` (`tsx prisma/seed.ts`); the old `package.json#prisma.seed` key is **silently ignored** in Prisma 7. So `prisma db seed` / `migrate dev` / `migrate reset` only seed via `migrations.seed`.
- **`prisma.config.ts` MUST stay excluded from `nest build`** (`tsconfig.build.json` `exclude`). It sits at the `apps/api` root and is in the base `tsconfig.json` `include`; if the build compiles it, tsc's `rootDir` widens to `apps/api` and the entrypoint emits to `dist/src/main.js` instead of `dist/main.js` — which silently breaks `start:prod` (`node dist/main`) and the e2e harness (`node dist/main.js`). Keep `"prisma.config.ts"` in the build exclude list.
- **After any Prisma version bump, the generated client must be regenerated** or `check-types` fails with `Module '@prisma/client' has no exported member '<Model>'` (stale client — pnpm relinks the package but does not re-run generation). Automated via `apps/api` `postinstall: prisma generate`; run `pnpm --filter api exec prisma generate` manually if you see those errors.
- **`ts-node` is a required devDependency in `apps/api` even though no source imports it** — Jest 29 dynamically `import('ts-node')` to transpile the TypeScript `jest.config.ts`. Removing it breaks `pnpm test:unit`. (Everything else — `seed`, `seed:dev`, `migrations.seed` — uses `tsx`.)
