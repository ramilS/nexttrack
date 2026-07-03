# @repo/migrator — YouTrack → NextTrack migration CLI

Migrates data from a **live YouTrack instance** into NextTrack over HTTP.

> **It does not read YouTrack backup files.** A YouTrack backup (`.tar.gz`/`.zip`)
> is an undocumented internal DB snapshot that JetBrains only supports restoring
> back into YouTrack itself. This tool follows JetBrains' recommended path for
> moving data to a third-party system: the **YouTrack REST API**.
>
> If all you have is a backup file and no running server, restore the backup into
> a throwaway YouTrack (Docker), then point this CLI at that instance.

## How it works

Classic ETL, one project at a time:

1. **Extract** from the YouTrack REST API (`/api/admin/users`, `/api/issues`,
   `/api/issues/{id}/comments`, …) — paginated, rate-limited.
2. **Transform** YouTrack entities → NextTrack DTOs (type/priority mapping,
   Markdown → Tiptap, custom fields, workflow statuses).
3. **Load** into NextTrack via the guarded migration API
   (`POST /api/admin/migration/*`), keeping a YouTrack-ID → NextTrack-ID map and a
   resumable checkpoint file.

Migrated: **users** (+ a ghost user for accounts deleted in YouTrack), **project
membership with roles**, **issues** (with type/priority/status/estimate),
**custom fields** (enum/user/period/date + multi-value), **tags**, **comments**,
**attachments**, **parent-child + other issue links**, **time-tracking**, and
**agile boards/sprints**. Rich text (descriptions + comments) is converted from
Markdown to Tiptap. Projects themselves must be pre-created (see Prerequisites).

## Prerequisites

- A running YouTrack instance you can reach over HTTP.
- A running NextTrack API (dev: `http://localhost:3001`) with the migration
  endpoints enabled (see below).
- Nothing to pre-create: the migrator **creates the target project itself**
  (idempotent by key), provisioning its workflow from the YouTrack project's
  State values so issue statuses map by name. Re-runs reuse the existing project.

## The four credentials, and where to get each

### `--source-url` — YouTrack base URL

The instance root, e.g. `https://youtrack.company.com` (self-hosted) or
`https://<org>.youtrack.cloud`.

### `--source-token` — YouTrack permanent token

A permanent token authenticates the CLI as a YouTrack user. Create one in
YouTrack (path is version-dependent, but currently):

> **Profile → Account Security → Tokens (or "Authentication") → New token…**
> (direct URL: `<source-url>/users/me?tab=account-security`)

Give it a scope that can **read YouTrack and the user list** — the migrator calls
`/api/admin/users`, so a token with only issue-read scope will 403 on the users
phase. The token looks like `perm:dXNlcm5hbWU=.…`.

### `--migration-secret` — NextTrack migration API secret

The migration endpoints require the header `x-migration-secret`, validated
(timing-safe, exact match) against the API's `MIGRATION_API_SECRET` env var. It
must be **exactly 32 characters**. If the API has no secret set, *every* migration
request is rejected with 403.

Generate one and set it on the API before running:

```bash
# 32 hex chars
openssl rand -hex 16
```

```dotenv
# apps/api/.env
MIGRATION_API_SECRET=<the 32 chars from openssl>
# Required to preserve original created/updated/resolved dates. Without it the
# API REJECTS any backdated record with 400 MIGRATION_BACKDATING_DISABLED
# (it is not silently ignored) — so migrations carrying original timestamps fail fast.
MIGRATION_ALLOW_BACKDATED_RECORDS=true
```

Restart the API after changing `.env`. Pass the same value to `--migration-secret`.

### `--target-url` — NextTrack base URL, WITHOUT `/api`

The CLI appends `/api` itself (`baseURL = <target-url>/api`). So use
`http://localhost:3001`, **not** `http://localhost:3001/api`.

### `--target-token` — NextTrack admin JWT

NextTrack delivers auth tokens **only as httpOnly cookies**, never in the response
body — but the API's JWT guard also accepts an `Authorization: Bearer` header, and
that is what the CLI sends. So you extract the `access_token` cookie from a login
response and pass it as the token.

The migration endpoints also require the user to be a **global admin**, so log in
as an admin account (dev seed defaults: `admin@nexttrack.local` / `Password123!`,
overridable via `ADMIN_EMAIL` / `ADMIN_PASSWORD` when seeding).

```bash
# Log in and print response headers; the token is in the Set-Cookie line
curl -i -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@nexttrack.local","password":"Password123!"}'
```

Look for:

```
Set-Cookie: access_token=eyJhbGciOiJIUzI1NiI...; Path=/; Max-Age=900; HttpOnly; SameSite=Lax
```

The value between `access_token=` and the first `;` is your `--target-token`.

One-liner to capture it into a shell variable:

```bash
TARGET_TOKEN=$(curl -s -i -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@nexttrack.local","password":"Password123!"}' \
  | grep -i '^set-cookie: access_token=' \
  | sed -E 's/^set-cookie: access_token=([^;]+);.*/\1/I')
echo "$TARGET_TOKEN"
```

> ⚠️ **Token TTL is 15 minutes by default** (`JWT_ACCESS_EXPIRES_IN`). The CLI does
> not refresh it. For any migration longer than that, raise the TTL on the API for
> the duration of the job (e.g. `JWT_ACCESS_EXPIRES_IN=4h`, then restart the API)
> or re-run login to get a fresh token before the real run.

## Running

Invoked with `pnpm` (the package scripts run the TypeScript source via `ts-node`;
`pnpm build` also produces the `youtrack-migrator` binary). The subcommand is
baked into the script, so pass flags after `--`.

### 1. Dry run (recommended first pass)

Reads YouTrack and prints `[DRY] Would create…` for every entity **without writing
anything** to NextTrack. Use it to confirm connectivity, credentials, and counts.

```bash
cd packages/migrator
pnpm migrate -- \
  --source-url https://youtrack.company.com \
  --source-token perm:XXXXXXXX \
  --target-url http://localhost:3001 \
  --target-token "$TARGET_TOKEN" \
  --migration-secret <32-char-secret> \
  --projects DEVX \
  --dry-run \
  --verbose
```

> **Dry run registers the target maps (statuses, custom fields) but skips all
> writes.** It resolves the same name→id mappings the real run uses, so unmapped
> custom fields already surface as warnings; it cannot, however, prove that
> issue/user references resolve (users aren't created in dry run). Follow it with
> a small real run against a disposable NextTrack DB before committing.

### 2. Real run (single project pilot)

Same command without `--dry-run`. Point it at a throwaway/reset NextTrack DB for
the pilot so you can inspect fidelity before committing.

```bash
cd packages/migrator
pnpm migrate -- \
  --source-url https://youtrack.company.com \
  --source-token perm:XXXXXXXX \
  --target-url http://localhost:3001 \
  --target-token "$TARGET_TOKEN" \
  --migration-secret <32-char-secret> \
  --projects DEVX \
  --with-attachments \
  --with-closed-issues \
  --checkpoint-file ./devx-checkpoint.json
```

### 3. Verify

Compares source vs. target counts per project.

```bash
pnpm verify -- \
  --source-url https://youtrack.company.com \
  --source-token perm:XXXXXXXX \
  --target-url http://localhost:3001 \
  --target-token "$TARGET_TOKEN" \
  --migration-secret <32-char-secret> \
  --projects DEVX
```

### Resuming

A run writes progress to the checkpoint file. If it stops (error, expired token),
fix the cause and re-run the same command with `--resume`. Inspect progress with
`pnpm status -- --checkpoint-file ./devx-checkpoint.json`.

## Flags (migrate)

| Flag | Required | Default | Purpose |
|---|---|---|---|
| `--source-url <url>` | yes | — | YouTrack base URL |
| `--source-token <token>` | yes | — | YouTrack permanent token |
| `--target-url <url>` | yes | — | NextTrack base URL (no `/api`) |
| `--target-token <token>` | yes | — | NextTrack admin JWT (`access_token` cookie value) |
| `--migration-secret <secret>` | yes | — | Value of `MIGRATION_API_SECRET` (32 chars) |
| `--projects <keys>` | one of these | — | Comma-separated keys, e.g. `DEVX,OPS` |
| `--all-projects` | one of these | `false` | Migrate every project |
| `--with-attachments` | no | `false` | Download + upload attachments |
| `--with-time-tracking` | no | `false` | Import work items as IMPORT-sourced time logs (recalculates `spent`) |
| `--with-boards` | no | `false` | Recreate agile boards as SCRUM boards + their sprints + sprint membership |
| `--with-closed-issues` | no | `false` | Include resolved/closed issues (default: unresolved only) |
| `--estimate-field <name>` | no | — | YouTrack custom field to map into the native `estimate` (story points). See Known limitations |
| `--dry-run` | no | `false` | Read + log, no writes |
| `--resume` | no | `false` | Continue from checkpoint |
| `--checkpoint-file <path>` | no | `./migration-checkpoint.json` | Progress file |
| `--concurrency <n>` | no | `3` | Parallel requests to YouTrack |
| `--batch-size <n>` | no | `50` | Issues per page |
| `--rate-limit <n>` | no | `10` | Requests/sec to YouTrack |
| `--verbose` | no | `false` | Detailed logging |

## Known limitations

- **Custom fields are matched to the target by NAME.** A field/option with no
  match in the target project is dropped with a one-time warning
  (`Custom field "<name>" has no mapping…` / `value could not be resolved…`),
  never silently. Create the matching fields/options in the target first, or
  accept the loss. Spot-check a few issues in the UI during the pilot.
- **`--estimate-field` is a unit decision.** NextTrack `estimate` is story points
  (integer); YouTrack "Estimation" is time (minutes). If you point
  `--estimate-field` at a period field the raw minutes are stored as-is with a
  loud `estimate-unit-mismatch` warning — usually you want a numeric story-points
  field instead. Left unset, `estimate` is not migrated.
- **Project roles are best-effort and version-dependent.** The role of each team
  member is read from a YouTrack endpoint whose shape changed across versions
  (unified into the app REST API in 2026.1); when it can't be read, members fall
  back to the Developer role. Verify roles landed as expected during the pilot
  (`team.extractor.ts` if the endpoint needs adjusting).
- **Content from deleted YouTrack accounts** (absent from `/admin/users`) is
  credited to a blocked "YouTrack Migration" ghost user rather than lost.
- **Agile boards are recreated as SCRUM boards** (so sprints can hold issues); a
  board shared across several projects is recreated once per migrated project.
- **Backdated timestamps require `MIGRATION_ALLOW_BACKDATED_RECORDS=true`** or the
  API rejects them with 400 (fail-fast, not silent).
