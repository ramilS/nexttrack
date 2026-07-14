# YouTrack Cloud Migration Program Roadmap

**Design:** `docs/superpowers/specs/2026-07-14-youtrack-cloud-full-fidelity-migration-design.md`

**Purpose:** Coordinate the sequence, dependencies, review gates, and safe
parallelism of the full-fidelity migration program. Detailed implementation
steps live in one plan per workstream.

## Workstreams

| Order | Workstream | Depends on | Parallel after dependencies | Acceptance gate |
|---|---|---|---|---|
| 1 | Migration manifest, idempotency, resume, fatal-error handling | None | No | Interrupted and uninterrupted fixture runs produce identical manifest state |
| 2 | Projects, users, groups, teams, roles, permissions | 1 | With 3 | Effective target access never exceeds source access |
| 3 | Custom-field definitions, bundles, versions, values | 1 | With 2 | Every definition/value verifies by source ID and semantic checksum |
| 4 | Issues, explicit hierarchy, dynamic link types, watchers, voters, visibility | 2, 3 | No | Current issue graph and access match source |
| 5 | Comments, attachments, time tracking, complete issue history | 4 | With 7 after activity interfaces settle | Content bytes, authorship, timestamps, threads, and history verify |
| 6 | Multi-project boards and sprint semantics | 2, 3, 4 | With 5 | Board configuration and sprint membership match source |
| 7 | Workflow inventory and translation | 2, 3 | Inventory with 4; loaders after 4 | No active workflow is silently omitted or replaced by full-mesh transitions |
| 8 | Articles and saved searches | 2, 3 | With 5 and 6 | Article tree/content/access and query semantics verify |
| 9 | Cross-domain verification, fault injection, scale validation | 1-8 | No | Two unchanged runs plus interrupted resumes produce zero unexplained differences |

## Plan Files

The first detailed plan is:

- `docs/superpowers/plans/2026-07-14-youtrack-migration-foundation.md`

Each later workstream receives its own detailed plan after the interfaces it
consumes have landed. This prevents speculative code signatures from being
distributed to subagents before the foundation establishes them.

## Subagent Execution Policy

- Use `superpowers:subagent-driven-development` for each detailed plan.
- Give each implementation task to a fresh implementer subagent.
- Run specification review, then code-quality review, before moving to the next
  task.
- Do not let two subagents edit the same files concurrently.
- Parallelize only workstreams marked parallel in the table and only after their
  dependency acceptance gates pass.
- The primary agent owns integration tests, schema compatibility, and final gate
  commands even when task implementation is delegated.
- Use a dedicated `codex/` branch or worktree for execution; do not implement on
  `master`.

## Global Gates

Every workstream must pass:

```bash
cd apps/api && pnpm test
cd packages/migrator && pnpm test
```

Workstreams that change shared schemas must also pass from the repository root:

```bash
pnpm check-types
```

Database workstreams must include a real migration, regenerate Prisma Client,
and run the relevant integration specs. A passing unit suite is not sufficient.

