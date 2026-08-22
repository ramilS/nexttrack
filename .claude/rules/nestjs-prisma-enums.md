# Prisma Enums — Always Use Constants, Never String Literals

## Rule

NEVER use string literals for Prisma enum values. ALWAYS import and use the generated enum constant.

This applies to ALL Prisma enums: `ActivityType`, `NotificationType`, `DeliveryChannel`, `SprintStatus`, `IssueType`, `IssuePriority`, `EmailMode`, `OutboxStatus`, `ProjectRole`, etc.

## Why

- String literals bypass TypeScript type checking — a typo like `'COMENT_ADD'` compiles without error
- Prisma 7.x generates `const` objects + union types (not TS enums), so `ActivityType.COMMENT_ADD` gives full autocomplete and refactor support
- If an enum value is renamed in the schema, `prisma generate` will produce a compile error at every usage site — but only if you use the constant

## Examples

### Wrong

```typescript
// No type safety — typos are silent bugs
await this.activitiesService.recordOne(issueId, userId, 'ISSUE_CREATED', {});

this.notificationsDispatch.dispatch({ type: 'ISSUE_ASSIGNED', ... });

if (sprint.status === 'ACTIVE') { ... }

activities.push({ type: 'STATUS_CHANGE', from: old, to: new });
```

### Correct

```typescript
import { ActivityType, NotificationType, SprintStatus } from '@prisma/client';

await this.activitiesService.recordOne(issueId, userId, ActivityType.ISSUE_CREATED, {});

this.notificationsDispatch.dispatch({ type: NotificationType.ISSUE_ASSIGNED, ... });

if (sprint.status === SprintStatus.ACTIVE) { ... }

activities.push({ type: ActivityType.STATUS_CHANGE, from: old, to: new });
```

## Checklist Before Committing

- Search for bare string matches of enum values: `'ISSUE_ASSIGNED'`, `'COMMENT_ADD'`, `'ACTIVE'`, etc.
- Each must be replaced with the corresponding `EnumName.VALUE` constant
- The import from `@prisma/client` must be present
