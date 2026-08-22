# Import Aliases — No Relative Paths

## Rule

NEVER use relative imports (`../`, `../../`) in `apps/api/src/`. Always use path aliases.

## Available Aliases

| Alias | Maps to | Example |
|-------|---------|---------|
| `@/*` | `apps/api/src/*` | `import { PrismaService } from '@/prisma/prisma.service'` |
| `@test/*` | `apps/api/test/*` | `import { buildUser } from '@test/helpers/factories'` |
| `@repo/shared` | `packages/shared/src/index` | `import { Permission } from '@repo/shared'` |
| `@repo/shared/*` | `packages/shared/src/*` | `import { ErrorCode } from '@repo/shared/error-codes'` |

## Why

- Readability: `@/prisma/prisma.service` vs `../../../prisma/prisma.service`
- Refactor-safe: moving a file doesn't break imports
- Consistency with `apps/web` which also uses `@/`

## `@repo/shared` Sub-paths

When importing from `@repo/shared/*`, check that a matching entry exists in `jest.config.ts` `moduleNameMapper`. If not, either:
1. Add a mapping to `jest.config.ts`
2. Import from `@repo/shared` (the barrel export) instead

## Wrong (relative paths — never do this)

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { Permission } from '../../../../../packages/shared/src/permissions';
import { buildUser } from '../../../test/helpers/factories';
```

The correct alias form for each is shown in the Available Aliases table above.
