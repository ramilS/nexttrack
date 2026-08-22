# Type Safety Rules

## No Double Assertions (`as unknown as`)

NEVER use `as unknown as Type` for Prisma JSON fields. Instead, create typed accessor functions.

### Wrong

```typescript
const columns = board.columns as unknown as BoardColumn[];
```

### Correct

```typescript
// In boards.service.ts (or wherever the type is defined):
export function getColumns(board: { columns: any }): BoardColumn[] {
  return (board.columns ?? []) as BoardColumn[];
}

// Usage:
const columns = getColumns(board);
```

### Why

- `as unknown as` bypasses ALL type checking — it tells TypeScript "I know better, shut up"
- A typed accessor centralizes the cast in ONE place, making it easy to add runtime validation later
- If the JSON shape changes, you fix one function instead of hunting down every cast

## Existing Accessors

- `getColumns(board)` — from `modules/boards/boards.service.ts`

Workflow statuses/transitions are **relational** as of the workflow-relational
migration (`workflow_statuses` / `workflow_transitions` tables, `Issue.statusId`
FK) — query the `statuses` / `transitions` relations directly (`include` /
`select` them) instead of casting a JSON column. The former `getStatuses` /
`getTransitions` accessors were removed.

## Use Library Types, Not `any`

Libraries export types for a reason — use them instead of `any`:

```typescript
// Wrong — lazy, loses all type safety
async process(job: any) { ... }
handleDrag(event: any) { ... }
onChange(e: any) { ... }

// Correct — use types from the library
import { Job } from 'bullmq';
async process(job: Job<WebhookPayload>) { ... }

import { DragEndEvent } from '@dnd-kit/core';
handleDrag(event: DragEndEvent) { ... }

import { JSONContent } from '@tiptap/core';
onChange(content: JSONContent) { ... }
```

Common library types to use:
- **Express**: `Request`, `Response` from `express`
- **Socket.IO**: `Socket`, `Server` from `socket.io`
- **BullMQ**: `Job<T>`, `Queue<T>` from `bullmq`
- **React**: `React.ChangeEvent<HTMLInputElement>`, `React.MouseEvent`, `React.KeyboardEvent`
- **Tiptap**: `JSONContent`, `Editor` from `@tiptap/core`
- **dnd-kit**: `DragEndEvent`, `DragStartEvent` from `@dnd-kit/core`
- **Prisma**: generated types from `@prisma/client`
- **TanStack Query**: `UseQueryResult<T>`, `UseMutationResult<T>`

## `as any` Is a Last Resort, Not a Solution

Before writing `as any`, ALWAYS look for a proper typed solution first:

1. **Wrong type?** — fix the type signature (e.g., decorator accepting `\`${Enum}\`` instead of `string`)
2. **Partial object in test?** — use a factory from `@test/helpers` (see `nestjs-test-quality.md`)
3. **Prisma JSON field?** — use a typed accessor function (see above)
4. **Decorator mismatch?** — fix the decorator's type, not the call site
5. **Library callback/event?** — import the proper type from the library (see above)

### Acceptable `as any`

- `payload as any` in Prisma `create`/`update` — Prisma requires `InputJsonValue`, no way around it
- `config as any` for Prisma JSON config fields — same reason

### Never acceptable

- `as any` to silence a type error you don't understand — investigate the root cause
- `as any` on mock return values — use factories or type the mock properly
- `as any` on function arguments — fix the function signature or create an overload
- `as any` on enum values — import the enum constant from `@prisma/client`
