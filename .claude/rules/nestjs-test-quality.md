# Test Code Quality

## Use Factories, Not Inline Partial Objects

NEVER create partial mock objects with `as any` to satisfy Prisma types. Use factory functions from `@test/helpers`.

### Wrong

```typescript
prisma.user.findMany.mockResolvedValue([
  { id: 'user-2', isBlocked: false, deletedAt: null } as any,
]);

prisma.issue.findUnique.mockResolvedValue({
  id: 'issue-1', title: 'Test', status: 'TODO',
} as any);
```

### Correct

```typescript
import { buildUser, buildProject } from '@test/helpers';

prisma.user.findMany.mockResolvedValue([
  buildUser({ id: 'user-2' }),
]);

prisma.issue.findUnique.mockResolvedValue(
  buildIssue({ id: 'issue-1', title: 'Test', status: 'TODO' }),
);
```

### Why

- `as any` hides type mismatches between mock and real data — a renamed field won't cause a compile error
- Factories produce full, valid objects — you only override what's relevant for the test
- If the schema changes, you update one factory, not 50 test files

### Available Factories (`@test/helpers/factories.ts`)

- `buildUser(overrides?)` — full `User` object
- `buildProject(overrides?)` — full `Project` object
- `buildProjectMember(overrides?)` — full `ProjectMember` object
- `buildRefreshToken(overrides?)` — full `RefreshToken` object
- `buildInvite(overrides?)` — full `Invite` object

### Adding New Factories

If a factory doesn't exist for an entity you need, create it in `test/helpers/factories.ts` following the same pattern: all required fields with sensible defaults + `...overrides` spread.

## Async Mock Methods

All mock methods for async service dependencies MUST use `.mockResolvedValue()` or `.mockRejectedValue()`, not `.mockReturnValue()` or bare `jest.fn()`. See `nestjs-error-handling.md` for details.
