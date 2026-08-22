#!/usr/bin/env bash
# PostToolUse hook: after an Edit/Write/MultiEdit to a Prisma-query-bearing file
# under apps/api/, inject a non-blocking reminder to self-check query performance
# against .claude/rules/nestjs-query-performance.md. Unit tests mock Prisma, so
# these issues (N+1, unbounded findMany, missing index) are invisible to a green
# test run and must be caught at write time.
#
# Always exits 0 (non-blocking). Emits context only when a query method is present.
set -euo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"

# Skip tests — they mock Prisma, so the checklist doesn't apply.
case "$file" in
  */apps/api/*.ts) ;;
  *) exit 0 ;;
esac
case "$file" in
  *.spec.ts | *.test.ts) exit 0 ;;
esac
[ -f "$file" ] || exit 0

# Detect a real Prisma query: raw SQL, or a method call on a `prisma`/`tx`
# receiver (`this.prisma.issue.findMany(`, `tx.issue.create(`). Requiring the
# receiver avoids false positives on `NestFactory.create(`, `Promise.all(`, or a
# service's own `.create()` — a bare `.create(` match is far too broad.
methods='findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy'
query_re="\\\$queryRaw|\\\$executeRaw|\\b(prisma|tx)\\.[A-Za-z_][A-Za-z0-9_]*\\.($methods)\\("
grep -Eq "$query_re" "$file" || exit 0

read -r -d '' msg <<'EOF' || true
You just edited a Prisma-query-bearing file under apps/api. Before moving on, self-check the query against .claude/rules/nestjs-query-performance.md — unit tests mock Prisma and will NOT catch any of these:
1. N+1 — no query inside a loop (incl. implicit: a relation touched in a loop that wasn't include/select-ed; a helper that queries per-iteration).
2. Independent sequential awaits → Promise.all (keep ordered guard checks after).
3. Per-row writes in a loop → createMany/updateMany (createMany only where rows can't pre-exist; else upsert).
4. select only the fields the mapper reads; avoid bare findMany pulling large JSON (e.g. a Tiptap description); prefer nested select over include.
5. Unbounded findMany → add take/keyset/offset, OR document a deliberate "show-all" list (never silently truncate with a cap + no UI signal).
6. Verify a composite index in schema.prisma covers this where + orderBy (equality cols first, then orderBy cols). Read the schema — do not assume.
7. Paginated list → $transaction([findMany, count]) for a consistent total.
8. Aggregate in the DB (count/aggregate/groupBy/$queryRaw CTE), not by fetching all rows and reducing in JS.
Confirm each point or fix it now.
EOF

jq -n --arg ctx "$msg" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
