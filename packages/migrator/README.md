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

Currently migrated: **users, projects (workflow statuses/transitions), issues,
parent-child links, comments, attachments, custom fields**.
Not yet wired into the flow: **agile boards/sprints, time-tracking** (extractors
exist, loading is a stub).

## Prerequisites

- A running YouTrack instance you can reach over HTTP.
- A running NextTrack API (dev: `http://localhost:3001`) with the migration
  endpoints enabled (see below).
- The **target project already created** in NextTrack with the **same project
  key** as in YouTrack — the migration API does *not* create projects and returns
  `MIGRATION_PROJECT_NOT_FOUND` if it is missing.

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

> **Dry run does not validate mappings.** It skips writes *and* the ID-map
> registration for statuses/users/custom fields, so a clean dry run proves
> connectivity and counts only — not that custom fields or statuses will map
> correctly. Follow it with a small real run against a disposable NextTrack DB.

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
| `--with-time-tracking` | no | `false` | **Rejected** — extraction exists but loading is not implemented; the run aborts if set |
| `--with-boards` | no | `false` | **Rejected** — extraction exists but loading is not implemented; the run aborts if set |
| `--with-closed-issues` | no | `false` | Include resolved/closed issues (default: unresolved only) |
| `--dry-run` | no | `false` | Read + log, no writes |
| `--resume` | no | `false` | Continue from checkpoint |
| `--checkpoint-file <path>` | no | `./migration-checkpoint.json` | Progress file |
| `--concurrency <n>` | no | `3` | Parallel requests to YouTrack |
| `--batch-size <n>` | no | `50` | Issues per page |
| `--rate-limit <n>` | no | `10` | Requests/sec to YouTrack |
| `--verbose` | no | `false` | Detailed logging |

## Known limitations

- **Custom fields with no target mapping are dropped — but loudly.** If a YouTrack
  custom field has no entry in the ID map (name → NextTrack field id), its value
  is dropped and the run prints
  `Custom field "<name>" has no mapping in the target — its values are being dropped`
  (once per field). Enum/user values that don't resolve to a target option/user
  are dropped the same way rather than written as `null`. Register the missing
  field/option mappings, or accept the loss — but it is no longer silent. Still
  worth spot-checking a few migrated issues in the UI during the pilot.
- **Boards/sprints and time-tracking are not migrated yet.** Extraction exists but
  loading does not, so `--with-boards` / `--with-time-tracking` **abort the run**
  with a "not implemented yet" error instead of silently doing nothing.
