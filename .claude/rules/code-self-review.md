# Self-Review After Writing Code

After writing or substantially changing a logical chunk of code — and ALWAYS
before claiming "done" or committing — review the diff with a **fresh-context
subagent**, not from your own working context.

## Why fresh context

The author is primed by the reasoning that produced the code and reads past its
flaws. A reviewer that sees only the diff plus the project rules — no conversation
history, no rationale — catches dead code, needless comments, and muddy names the
author rationalizes away.

## How

Dispatch a review subagent (`pr-review-toolkit:code-reviewer`, a `general-purpose`
agent, or `superpowers:requesting-code-review`) given ONLY:

- the diff (`git diff` or the changed files),
- the relevant `.claude/rules/*.md`,
- no prior conversation.

Ask it to check, in order:

1. **No leftover / extra code** — dead symbols, unused imports, debug output,
   commented-out code, speculative "just in case" abstractions (YAGNI).
2. **No needless comments** — delete anything that restates the name/signature or
   narrates obvious code; keep only the non-obvious WHY (see `nestjs-code-style.md`).
3. **Simpler / cleaner / clearer** — shorter, less nested (early returns), less
   clever (KISS); real repetition extracted (DRY).
4. **Domain-intent naming** — names say WHAT in the domain, not HOW it is
   implemented: `expiryFrom(start)` not `advance(start)`, `canEditPost` not
   `checkRoleAndOwnership`.
5. **Project conventions** — the checks the matching `.claude/rules/*` enforce
   (enum constants over string literals, no `as any`, immutable updates, domain
   errors not HTTP exceptions in services, `@RequirePermission` on mutations, …).
6. **Query performance** — if the change touched ANY Prisma query, run the
   `nestjs-query-performance.md` checklist (N+1, batched writes, `select`,
   unbounded `findMany`, composite index covering `where`+`orderBy`,
   `$transaction` for paginated counts, DB-side aggregation). Unit tests mock
   Prisma, so they will NOT catch these — verify by reading the query and the
   schema, not by trusting a green test run.

## Acting on findings

Fix CRITICAL/HIGH before "done"; apply cheap MEDIUM fixes. Don't perform
agreement — verify each suggestion and reject wrong ones with a reason (see
`superpowers:receiving-code-review`). Then re-run the gate from `workflow.md`
(tests + `check-types`).
