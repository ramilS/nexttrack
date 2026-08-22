# NestJS Anti-Patterns to Avoid

Quick checklist. Each item links to the canonical rule file with full examples.

- **Silent error swallowing** — never `.catch(() => {})`, always log → `nestjs-async-safety.md`
- **Unvalidated controller inputs** — every `@Body()`/whole-object `@Query()` param must be typed as a `createZodDto` class (validated by the global pipe) → `nestjs-zod-validation.md`
- **Inline type assertions** — no `as unknown as` for Prisma JSON, use typed accessors → `nestjs-type-safety.md`
- **Hardcoded magic numbers** — timeouts/limits/thresholds come from typed config (HTTP codes, `0`, `1`, `-1` are fine inline) → `nestjs-typed-config.md`
- **Decorator type workarounds** — no `@Roles('ADMIN' as any)`; fix the decorator's type signature → `nestjs-type-safety.md`
- **String literals for enums** — `SprintStatus.ACTIVE`, never `'ACTIVE'` → `nestjs-prisma-enums.md`
- **Missing permission checks** — every mutating endpoint needs `@RequirePermission()` → `nestjs-permissions.md`
- **HTTP exceptions in services** — services throw `DomainError` subclasses (`NotFoundError`, `ValidationError`, …), never `NotFoundException`/`BadRequestException` → `nestjs-error-handling.md`
- **Foreign repository injection for reads** — read-only cross-module access goes through `<X>Reader` facades, not the owner's repository → `nestjs-module-boundaries.md`

## N+1 Query Patterns

NEVER loop over items and issue individual DB queries inside the loop. Use batch operations.

```typescript
// Wrong — N+1 queries
for (const userId of recipientIds) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
}

// Correct — single batch query
const users = await prisma.user.findMany({
  where: { id: { in: recipientIds } },
});
```

### Database Query Optimization

- Use `select` for only needed fields; `include` sparingly (prefer nested `select`); add `@index` for fields used in `where`/`orderBy`/`JOIN`
- Paginated lists: `$transaction([findMany, count])` for consistent totals. Bulk per-row updates: `$transaction` of individual updates (document why batch isn't possible)
- Implicit N+1 in relations — accessing `issue.project` inside a loop needs `include: { project: true }` in the original query
