# Workflow Rules

## Before Answering

- Plan which competencies/expertise are needed for the task (NestJS architecture, frontend, DB design, DevOps, etc.) and apply that lens
- If something is unclear or ambiguous — ask clarifying questions before implementing. Don't guess.
- If the user uses incorrect terminology or a suboptimal approach — explain why and suggest the better alternative

## Critical Evaluation of Requests

- Before implementing a user's request, evaluate whether the proposed solution is architecturally sound
- If the approach has flaws — explain the issues and suggest a better alternative. Don't blindly implement bad decisions.
- If the request is reasonable but could be improved — implement it AND suggest the improvement
- It's OK to push back with "this will cause problems because X, let's do Y instead"

## Steel Man → Critique → Seek Truth

For architectural decisions (new module, new pattern, choosing between approaches):

1. **Steel man** — formulate the strongest argument FOR the chosen approach. Why is this the best option?
2. **Critique** — now attack it. What are the weak spots, edge cases, scaling issues, maintenance burden?
3. **Seek truth** — weigh both sides. Is this still the best option, or did critique reveal a better path?

Apply this to YOUR OWN proposals too, not just the user's requests. If you propose an architecture and the critique phase reveals serious flaws — say so and suggest the better alternative before the user has to ask.

## Verify Real Data Before Changing Code

When fixing a bug or building a feature that involves data flowing between systems (DB → API → frontend), **trace the full path with real data before writing any code**:

1. **Check the actual API response** — `curl` the endpoint or read the controller+service to see the real response shape. Never assume the TypeScript types match reality.
2. **Check the actual DB data** — seed scripts, migrations, and service code may disagree. The DB is the source of truth, not the code that was *supposed* to populate it.
3. **Check how UI components actually work** — read the component source in `components/ui/`, don't assume API from docs or other frameworks (e.g. base-ui Select needs `label` on `SelectItem`, unlike Radix).
4. **Match field names end-to-end** — if the backend returns `fieldId`, the frontend type must say `fieldId`, not `customFieldId`. One curl request catches this instantly.

### Why

Fixing code based on reading source alone leads to a chain of symptom-fixes: each change reveals the next mismatch because the full pipeline was never verified. One upfront check of real data (API response, DB row, rendered DOM) prevents this entirely.

### Anti-pattern: Unit Tests as Proof

Unit tests that pass mock data directly to a component prove the component renders correctly **given perfect input**. They say nothing about whether real input matches that shape. After fixing a data flow bug, verify the fix works with the real running system — not just with mocks.

## Code Changes

- When code is changed, suggest writing tests following the Test Pyramid (unit > integration > e2e)
- If you spot opportunities to refactor surrounding code for clarity/readability — suggest it (don't silently do it)
- Use JetBrains MCP tools for rename/refactor operations when available

## Proactive Refactoring

- If you see code that is growing in complexity (long methods, god-classes, tangled dependencies) — proactively suggest refactoring BEFORE it becomes a major problem
- Signs that refactoring is overdue: method >50 lines, service >300 lines, >5 constructor dependencies, deeply nested conditionals, copy-pasted logic across files
- Suggest specific refactoring approach: extract method, extract service, introduce strategy pattern, etc.
- Don't wait for the user to ask — flag it with "this area is becoming complex, I'd suggest refactoring X because Y"

## Boy Scout Rule

- Leave code better than you found it. When touching a file, fix minor issues nearby: unclear names, dead imports, missing types, inconsistent formatting
- Don't do massive drive-by refactors — keep improvements proportional to the task size
- If you see a bigger problem (anti-pattern, architectural issue, tech debt) that's out of scope — add it to a todo/plan for later, don't ignore it

## Code Review During Work

- While reading code for a task, if you notice bugs, anti-patterns, or violations of project rules (see other `.claude/rules/*.md`) — flag them and propose adding to a fix plan
- Don't silently pass by broken code just because "it's not my task"
- Check for: missing validation pipes, string literals instead of enum constants, `as unknown as` casts, missing `@RequirePermission()`, N+1 query patterns

## Task Finalization

- Every task MUST be finalized by running relevant tests before considering it done:
  - Backend changes → `cd apps/api && pnpm test` (at minimum the affected module: `pnpm test -- --testPathPattern=modules/<name>`)
  - Frontend changes → `cd apps/web && pnpm test`
  - Cross-cutting changes → both
  - If tests fail — fix them before reporting the task as complete
- Run `pnpm check-types` to verify no type errors were introduced

## Self-Updating Documentation

- When making architectural changes (new module, new pattern, new convention, config change, new shared utility), update the corresponding `.claude/rules/*.md` file or `CLAUDE.md`
- If a new rule/pattern emerges from the work — create or update a rule file so future sessions follow it
- If an existing rule becomes outdated due to changes — update or remove it

## Task Tracking

- For complex multi-step tasks, create a todo list to track progress and stay on track

## Git Safety

- Before committing, verify the current branch is NOT `main`, `master`, `dev`, or `staging`
- Always use `pnpm`, never `npm` or `yarn`

## Communication

- Respond in the same language as the user's message
