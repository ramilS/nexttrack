# Integration API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let external systems create issues in NextTrack over HTTP using a project API key, without a browser session and without NextTrack knowing anything about the caller.

**Architecture:** No new endpoints. A project API key authenticates as a `SERVICE` user that is a project member holding the `Integration` role, so the existing `PermissionGuard` authorizes machines exactly as it authorizes humans. Callers supply an opaque `dedupKey` on issue creation; a partial unique index makes repeat submissions return the existing issue instead of a duplicate.

**Tech Stack:** NestJS 11, Prisma 7 (Postgres), Zod via `nestjs-zod`, Jest (API unit + integration), Next.js 15 + TanStack Query, Vitest (web unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-21-integration-api-design.md`

## Deviations from the spec

Three implementation choices differ from the approved design. Each removes an unverified assumption or a dependency. Raise with the author before implementing if any is unwelcome.

1. **Guard composition instead of `AuthGuard(['jwt', 'api-key'])`.** The spec proposed a Passport strategy list. This plan instead has `JwtAuthGuard` check for the `X-Api-Key` header and delegate to `ApiKeyAuthService`, falling back to `super.canActivate` otherwise. Reasons: no Passport strategy plumbing and no new dependency (`passport-headerapikey` or a direct dependency on the transitive `passport-strategy`); a bad key produces a clear key-specific 401 rather than a JWT challenge. This resolves spec §10 item 1 — the strategy-ordering question no longer applies.

2. **One `ErrorCode` for all key failures.** The spec did not name the codes. This plan uses a single `API_KEY_INVALID` for unknown, revoked, and expired keys. Distinct codes would tell an attacker that a guessed key exists.

3. **No per-key rate-limit value; per-key *bucket* only.** The spec called for `integrationConfig.rateLimitPerMinute`. Instead this plan moves the existing hardcoded throttler limits into typed config (they are magic numbers today) and overrides `getTracker` so each verified key gets its own bucket instead of sharing the caller's IP bucket. Machines and humans then share the same configurable ceilings but never contend for the same bucket. A separate machine-specific limit is deferred until one integration actually needs a different number.

## Global Constraints

- Package manager is `pnpm`. Never `npm` or `yarn`.
- No relative imports inside `apps/api/src`. Use `@/*`, `@test/*`, `@repo/shared`, `@repo/shared/*`.
- Services throw `DomainError` subclasses from `@/common/errors/domain.errors` (`ValidationError`, `NotFoundError`, `ConflictError`, `PermissionDeniedError`, `UnauthenticatedError`). NestJS HTTP exceptions only in the transport layer (guards, controllers, pipes, strategies, filters).
- Prisma enum values come from the generated constant (`UserKind.SERVICE`), never a string literal.
- No `as any`, no `as unknown as`, no `@ts-ignore`.
- Every `@Body()` / whole-object `@Query()` param is typed as a `createZodDto` class.
- Loggers are `AppLogger` from `@/common/logging/app-logger`, not the bare NestJS `Logger`.
- DB-writing fire-and-forget goes through `BackgroundTasks.run` from `@/common/background`, never a bare `void … .catch()`.
- Mocked async dependencies use `.mockResolvedValue()` / `.mockRejectedValue()`, never bare `jest.fn()`.
- Test fixtures use factories from `@test/helpers`, never inline partial objects with `as any`. Add a factory if one is missing.
- `Integration` role id is exactly `00000000-0000-0000-0000-000000000006`.
- `Issue.dedupKey` is `VarChar(200)`; the Zod field is `z.string().trim().min(1).max(200).optional()`.
- Default throttler limits keep today's values: short 3 req / 1000 ms, medium 20 req / 10000 ms, long 100 req / 60000 ms.
- Integration tests need the local stack (`infra/docker compose up -d postgres valkey minio elasticsearch`). Never run API integration tests and Playwright e2e concurrently — they share one Postgres and truncate between cases.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/api/src/modules/api-keys/api-key-token.ts` | Pure helpers: generate a raw key, derive prefix, hash to SHA-256 hex. No I/O. |
| `apps/api/src/modules/api-keys/api-keys.repository.ts` | All Prisma access for `ProjectApiKey`. |
| `apps/api/src/modules/api-keys/api-keys.service.ts` | Issue / revoke / list keys; owns the `SERVICE` user and membership lifecycle. |
| `apps/api/src/modules/api-keys/api-key-auth.service.ts` | Authenticate a presented key, populate `req.user`, touch `lastUsedAt`. |
| `apps/api/src/modules/api-keys/api-keys.controller.ts` | `projects/:key/api-keys` CRUD. |
| `apps/api/src/modules/api-keys/api-keys.dto.ts` | ZodDto wrappers + response DTOs. |
| `apps/api/src/modules/api-keys/api-keys.module.ts` | Wiring; exports `ApiKeyAuthService` for the guard. |
| `apps/api/src/modules/api-keys/integration-role.ts` | The `Integration` role definition, shared by seeds and migration verification. |
| `apps/api/src/common/http/integration-request.ts` | `IntegrationRequest` interface — the typed shape of `req` fields this feature adds. |
| `apps/api/src/config/throttle.config.ts` | Typed throttler limits. |
| `apps/api/src/common/guards/api-key-aware-throttler.guard.ts` | `getTracker` override: verified key id, else IP. |
| `apps/web/app/(main)/projects/[key]/settings/api-keys/page.tsx` | Settings page. |
| `apps/web/components/api-keys/api-keys-card.tsx` | List + create + revoke. |
| `apps/web/components/api-keys/api-key-created-dialog.tsx` | One-time secret reveal. |
| `apps/web/components/shared/service-actor-badge.tsx` | Integration badge next to a `SERVICE` actor. |
| `apps/web/lib/api/api-keys.ts` | Client + query keys. |

**Modified**

| Path | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | `UserKind` enum, `User.kind`, `User` relations, `Issue.dedupKey`, `ProjectApiKey` model. |
| `apps/api/prisma/seed.ts`, `apps/api/prisma/seed-dev.ts` | Add the `Integration` system role. |
| `apps/api/src/modules/auth/auth.service.ts` | Refuse login for `kind === SERVICE`. |
| `apps/api/src/common/guards/jwt-auth.guard.ts` | Delegate to `ApiKeyAuthService` when `X-Api-Key` is present. |
| `apps/api/src/modules/projects/projects-members.service.ts` | Refuse hand removal of a `SERVICE` member with a live key. |
| `apps/api/src/modules/issues/issues.service.ts` | `dedupKey` fast path, P2002 fallback, dedup result flag. |
| `apps/api/src/modules/issues/issues.repository.ts` | Persist `dedupKey`; `findByDedupKey`. |
| `apps/api/src/modules/issues/issues.controller.ts` | `200` + `meta.deduplicated` on a dedup hit. |
| `packages/shared/src/schemas/issue.schema.ts` | `dedupKey` on `createIssueSchema`. |
| `packages/shared/src/enums/error-codes.enum.ts` | `API_KEY_INVALID`, `API_KEY_NAME_TAKEN`, `SERVICE_MEMBER_HAS_ACTIVE_KEY`. |
| `packages/shared/src/permissions.ts` | `Integration` role in the system-role list. |
| `apps/api/src/app.module.ts` | `throttleConfig`, `ApiKeyAwareThrottlerGuard`, `ApiKeysModule`. |
| `apps/api/src/config/index.ts` | Re-export `throttleConfig`. |
| `apps/api/test/support/global-setup.ts` | Create the partial unique index after `db push`. |
| `apps/api/src/modules/projects/projects-members.repository.ts` | Exclude `SERVICE` from member listings. |
| `apps/api/src/modules/users/users.repository.ts` | Exclude `SERVICE` from user lookups feeding pickers/mentions. |
| `apps/web/app/(main)/projects/[key]/settings/layout.tsx` | Nav entry for API Keys. |
| `CLAUDE.md`, `.claude/rules/nestjs-auth-sessions.md`, `.claude/rules/nestjs-module-boundaries.md` | Document the feature. |

---

## Task 1: `User.kind` and login refusal

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_user_kind/migration.sql` (generated)
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `apps/api/src/modules/auth/auth.service.spec.ts`
- Modify: `apps/api/test/helpers/factories.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `UserKind` from `@prisma/client` with members `HUMAN` and `SERVICE`; `buildUser()` defaults to `kind: UserKind.HUMAN`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/modules/auth/auth.service.spec.ts`, inside the existing `login` describe block:

```typescript
it('refuses login for a service principal', async () => {
  // Arrange
  const serviceUser = buildUser({
    kind: UserKind.SERVICE,
    email: 'svc.abc123@integrations.invalid',
    passwordHash: null,
  });
  usersRepo.findByEmailWithPasswordHash.mockResolvedValue(serviceUser);

  // Act + Assert
  await expect(
    service.login({ email: serviceUser.email, password: 'whatever' }, undefined, undefined),
  ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
});
```

Add `UserKind` to the `@prisma/client` import at the top of the spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=auth.service.spec -t "service principal"`
Expected: FAIL — `UserKind` is not exported from `@prisma/client` (the enum does not exist yet).

- [ ] **Step 3: Add the enum and column to the schema**

In `apps/api/prisma/schema.prisma`, add near the other enums:

```prisma
enum UserKind {
  HUMAN
  SERVICE

  @@map("user_kind")
}
```

In `model User`, next to `role`:

```prisma
  kind UserKind @default(HUMAN)
```

Generate the migration and client:

```bash
cd apps/api && pnpm prisma migrate dev --name add_user_kind
```

- [ ] **Step 4: Add `kind` to the user factory**

In `apps/api/test/helpers/factories.ts`, add to the `buildUser` defaults:

```typescript
  kind: UserKind.HUMAN,
```

Import `UserKind` from `@prisma/client` in that file.

- [ ] **Step 5: Refuse the login**

In `apps/api/src/modules/auth/auth.service.ts`, in `login`, immediately after the user is loaded and before the password comparison:

```typescript
    if (user.kind === UserKind.SERVICE) {
      // A service principal authenticates with an API key, never a password.
      // Reported as invalid credentials so the response does not confirm that
      // this address belongs to an integration.
      this.logger.warn('Login attempt for service principal', { userId: user.id });
      throw new UnauthenticatedError(ErrorCode.INVALID_CREDENTIALS);
    }
```

Import `UserKind` from `@prisma/client`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=auth.service.spec`
Expected: PASS, including all pre-existing login tests.

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && pnpm check-types`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/auth apps/api/test/helpers/factories.ts
git commit -m "feat(api): add User.kind and refuse password login for service principals"
```

---

## Task 2: The `Integration` system role

**Files:**
- Create: `apps/api/src/modules/api-keys/integration-role.ts`
- Test: `apps/api/src/modules/api-keys/integration-role.spec.ts`
- Modify: `apps/api/prisma/seed.ts`, `apps/api/prisma/seed-dev.ts`
- Create: `apps/api/prisma/migrations/<timestamp>_add_integration_role/migration.sql`

**Interfaces:**
- Consumes: `Permission` from `@repo/shared`.
- Produces: `INTEGRATION_ROLE_ID: string`, `INTEGRATION_ROLE: { id, name, description, permissions, isSystem }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/api-keys/integration-role.spec.ts`:

```typescript
import { Permission } from '@repo/shared';
import { INTEGRATION_ROLE, INTEGRATION_ROLE_ID } from './integration-role';

describe('INTEGRATION_ROLE', () => {
  it('uses the reserved system-role id', () => {
    expect(INTEGRATION_ROLE_ID).toBe('00000000-0000-0000-0000-000000000006');
    expect(INTEGRATION_ROLE.id).toBe(INTEGRATION_ROLE_ID);
  });

  it('grants exactly read, create and comment — nothing that can edit an issue', () => {
    expect(new Set(INTEGRATION_ROLE.permissions)).toEqual(
      new Set([Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE]),
    );
  });

  it('is a system role so it cannot be edited or deleted from the UI', () => {
    expect(INTEGRATION_ROLE.isSystem).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=integration-role`
Expected: FAIL — cannot find module `./integration-role`.

- [ ] **Step 3: Write the role definition**

Create `apps/api/src/modules/api-keys/integration-role.ts`:

```typescript
import { Permission } from '@repo/shared';

export const INTEGRATION_ROLE_ID = '00000000-0000-0000-0000-000000000006';

/**
 * Default role for API-key service principals. Deliberately excludes
 * ISSUE_UPDATE: granting it would let any integration rewrite every field of
 * every issue. A deployment that wants reopen-on-recurrence assigns its service
 * user a custom role instead.
 */
export const INTEGRATION_ROLE = {
  id: INTEGRATION_ROLE_ID,
  name: 'Integration',
  description: 'Machine access: read issues, create issues, comment',
  permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE],
  isSystem: true,
} as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=integration-role`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the role to both seeds**

In `apps/api/prisma/seed.ts`, add an entry to the system-role array, matching the existing shape used for ids `…0001`–`…0005`:

```typescript
  {
    id: '00000000-0000-0000-0000-000000000006',
    name: 'Integration',
    description: 'Machine access: read issues, create issues, comment',
    permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE],
  },
```

Add the identical entry to the `SYSTEM_ROLES` array in `apps/api/prisma/seed-dev.ts` (around line 174, after `Observer`).

- [ ] **Step 6: Add the data migration**

`prisma migrate deploy` does not run seeds, so an already-deployed instance would have no `Integration` role and could not issue a key. Create the migration directory and file by hand:

```bash
cd apps/api && mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_add_integration_role"
```

Write `migration.sql` in that directory:

```sql
INSERT INTO roles (id, name, description, permissions, is_system, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000006',
  'Integration',
  'Machine access: read issues, create issues, comment',
  '["ISSUE_READ","ISSUE_CREATE","COMMENT_CREATE"]'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 7: Verify the migration applies cleanly**

```bash
cd apps/api && pnpm prisma migrate deploy
```

Expected: the new migration is applied with no error. Re-run it once more (`pnpm prisma migrate deploy`) and confirm it reports nothing pending — proving the insert is idempotent under a replayed schema.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/api-keys apps/api/prisma
git commit -m "feat(api): add Integration system role for service principals"
```

---

## Task 3: Key token helpers, model and repository

**Files:**
- Create: `apps/api/src/modules/api-keys/api-key-token.ts`
- Test: `apps/api/src/modules/api-keys/api-key-token.spec.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_project_api_keys/migration.sql` (generated)
- Create: `apps/api/src/modules/api-keys/api-keys.repository.ts`

**Interfaces:**
- Consumes: `PrismaService` from `@/prisma/prisma.service`.
- Produces:
  - `API_KEY_PREFIX_LENGTH: number`
  - `generateApiKey(): { raw: string; prefix: string; hash: string }`
  - `hashApiKey(raw: string): string`
  - `ApiKeyRow { id, projectId, userId, name, prefix, expiresAt: Date | null, revokedAt: Date | null, lastUsedAt: Date | null, createdAt: Date }`
  - `ApiKeyPrincipalRow { id, userId, expiresAt, revokedAt, lastUsedAt, user: { id, email, name, avatarUrl, role, kind, isBlocked, deletedAt } }`
  - `ApiKeysRepository` with `findActiveByHash(tokenHash)`, `create(input, tx?)`, `findById(id)`, `listByProject(projectId)`, `revoke(id, tx?)`, `touchLastUsed(id, at)`, `countActiveForUser(userId)`. Duplicate names are prevented by the `@@unique([projectId, name])` constraint, not by a lookup method.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/api-keys/api-key-token.spec.ts`:

```typescript
import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey } from './api-key-token';

describe('api key token', () => {
  it('generates a prefixed key whose hash is the SHA-256 hex of the raw value', () => {
    const { raw, prefix, hash } = generateApiKey();

    expect(raw.startsWith('nt_')).toBe(true);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hash).toHaveLength(64);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it('never returns the same raw key twice', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey().raw));
    expect(keys.size).toBe(100);
  });

  it('hashes deterministically so lookup by hash finds the same row', () => {
    expect(hashApiKey('nt_fixed_value')).toBe(hashApiKey('nt_fixed_value'));
    expect(hashApiKey('nt_fixed_value')).not.toBe(hashApiKey('nt_other_value'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-token`
Expected: FAIL — cannot find module `./api-key-token`.

- [ ] **Step 3: Write the helpers**

Create `apps/api/src/modules/api-keys/api-key-token.ts`:

```typescript
import { createHash, randomBytes } from 'node:crypto';

const RAW_KEY_BYTES = 32;
const KEY_NAMESPACE = 'nt_';
export const API_KEY_PREFIX_LENGTH = 11;

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * The raw value is returned to the caller exactly once and never stored. Only
 * the SHA-256 hash is persisted: 32 random bytes already carry enough entropy
 * that a slow hash buys nothing, which is the same reasoning applied to
 * refresh tokens.
 */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_NAMESPACE + randomBytes(RAW_KEY_BYTES).toString('base64url');
  return {
    raw,
    prefix: raw.slice(0, API_KEY_PREFIX_LENGTH),
    hash: hashApiKey(raw),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-token`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the model to the schema**

In `apps/api/prisma/schema.prisma` add:

```prisma
model ProjectApiKey {
  id          String    @id @default(uuid())
  projectId   String    @map("project_id")
  userId      String    @map("user_id")
  name        String    @db.VarChar(100)
  prefix      String    @db.VarChar(16)
  tokenHash   String    @unique @map("token_hash")
  expiresAt   DateTime? @map("expires_at")   @db.Timestamptz(3)
  lastUsedAt  DateTime? @map("last_used_at") @db.Timestamptz(3)
  revokedAt   DateTime? @map("revoked_at")   @db.Timestamptz(3)
  createdById String    @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User    @relation("ApiKeyPrincipal", fields: [userId], references: [id])
  createdBy User    @relation("ApiKeyCreator", fields: [createdById], references: [id])

  @@unique([projectId, name])
  @@index([projectId])
  @@map("project_api_keys")
}
```

In `model User`, add both back-relations:

```prisma
  apiKeys        ProjectApiKey[] @relation("ApiKeyPrincipal")
  createdApiKeys ProjectApiKey[] @relation("ApiKeyCreator")
```

In `model Project`, add:

```prisma
  apiKeys ProjectApiKey[]
```

`@@unique([projectId, name])` is what makes the duplicate-name check in Task 4 race-safe.

Generate:

```bash
cd apps/api && pnpm prisma migrate dev --name add_project_api_keys
```

- [ ] **Step 6: Write the repository**

Create `apps/api/src/modules/api-keys/api-keys.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { GlobalRole, UserKind } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface ApiKeyRow {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  prefix: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyPrincipalRow {
  id: string;
  userId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: GlobalRole;
    kind: UserKind;
    isBlocked: boolean;
    deletedAt: Date | null;
  };
}

export interface ApiKeyCreateInput {
  projectId: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  expiresAt: Date | null;
  createdById: string;
}

const ROW_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  name: true,
  prefix: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeysRepository {
  constructor(private prisma: PrismaService) {}

  findActiveByHash(tokenHash: string): Promise<ApiKeyPrincipalRow | null> {
    return this.prisma.projectApiKey.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            role: true,
            kind: true,
            isBlocked: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  create(input: ApiKeyCreateInput): Promise<ApiKeyRow> {
    return this.prisma.projectApiKey.create({ data: input, select: ROW_SELECT });
  }

  findById(id: string): Promise<ApiKeyRow | null> {
    return this.prisma.projectApiKey.findUnique({ where: { id }, select: ROW_SELECT });
  }

  listByProject(projectId: string): Promise<ApiKeyRow[]> {
    return this.prisma.projectApiKey.findMany({
      where: { projectId },
      select: ROW_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.projectApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.projectApiKey.update({ where: { id }, data: { lastUsedAt: at } });
  }

  countActiveForUser(userId: string): Promise<number> {
    return this.prisma.projectApiKey.count({
      where: { userId, revokedAt: null },
    });
  }
}
```

Query-performance notes for this file: `findActiveByHash` and `findById` are unique-key lookups; `listByProject` is bounded by the number of keys a project holds (a human-managed list, single digits in practice) and is covered by `@@index([projectId])` with `createdAt` ordering; `countActiveForUser` is covered by the `user_id` column of the same table and is called once per revoke. No loops issue queries here.

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && pnpm check-types`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/api-keys apps/api/prisma
git commit -m "feat(api): add ProjectApiKey model, token helpers and repository"
```

---

## Task 4: Issue, list and revoke keys

**Files:**
- Create: `apps/api/src/modules/api-keys/api-keys.service.ts`
- Test: `apps/api/src/modules/api-keys/api-keys.service.spec.ts`
- Modify: `packages/shared/src/enums/error-codes.enum.ts`

**Interfaces:**
- Consumes: `ApiKeysRepository`, `generateApiKey`, `INTEGRATION_ROLE_ID`, `UsersRepository` (`@/modules/users/users.repository`), `ProjectMembersRepository` (`@/modules/projects/projects-members.repository`), `TransactionService` (`@/prisma/transaction.service`), `PermissionsCacheService`.
- Produces:
  - `IssuedApiKey { key: ApiKeyRow; raw: string }`
  - `ApiKeysService.issue(projectId, input: { name: string; expiresAt: Date | null }, createdById: string): Promise<IssuedApiKey>`
  - `ApiKeysService.list(projectId): Promise<ApiKeyRow[]>`
  - `ApiKeysService.revoke(projectId, keyId): Promise<void>`

- [ ] **Step 1: Add the error codes**

In `packages/shared/src/enums/error-codes.enum.ts`, add three members inside the `ErrorCode` enum:

```typescript
  API_KEY_INVALID = 'API_KEY_INVALID',
  API_KEY_NAME_TAKEN = 'API_KEY_NAME_TAKEN',
  SERVICE_MEMBER_HAS_ACTIVE_KEY = 'SERVICE_MEMBER_HAS_ACTIVE_KEY',
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/modules/api-keys/api-keys.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { buildUser } from '@test/helpers';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';
import { INTEGRATION_ROLE_ID } from './integration-role';
import { UsersRepository } from '@/modules/users/users.repository';
import { ProjectMembersRepository } from '@/modules/projects/projects-members.repository';
import { TransactionService } from '@/prisma/transaction.service';
import { PermissionsCacheService } from '@/common/permissions/permissions-cache.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repo: jest.Mocked<ApiKeysRepository>;
  let usersRepo: jest.Mocked<UsersRepository>;
  let membersRepo: jest.Mocked<ProjectMembersRepository>;

  const PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const CREATOR_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockResolvedValue({
        id: 'key-1',
        projectId: PROJECT_ID,
        userId: 'svc-1',
        name: 'MyTracker',
        prefix: 'nt_abcdefgh',
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
      listByProject: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      revoke: jest.fn().mockResolvedValue(undefined),
      countActiveForUser: jest.fn().mockResolvedValue(0),
      findActiveByHash: jest.fn().mockResolvedValue(null),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ApiKeysRepository>;

    usersRepo = {
      createServicePrincipal: jest
        .fn()
        .mockResolvedValue(buildUser({ id: 'svc-1', kind: UserKind.SERVICE })),
    } as unknown as jest.Mocked<UsersRepository>;

    membersRepo = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectMembersRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: repo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        {
          provide: TransactionService,
          useValue: { run: jest.fn((cb: (tx: unknown) => unknown) => cb({})) },
        },
        {
          provide: PermissionsCacheService,
          useValue: { invalidateAll: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get(ApiKeysService);
  });

  it('returns the raw key exactly once and stores only its hash', async () => {
    const issued = await service.issue(
      PROJECT_ID,
      { name: 'MyTracker', expiresAt: null },
      CREATOR_ID,
    );

    expect(issued.raw.startsWith('nt_')).toBe(true);
    const stored = repo.create.mock.calls[0][0];
    expect(stored.tokenHash).not.toContain(issued.raw);
    expect(stored.tokenHash).toHaveLength(64);
    expect(Object.values(stored)).not.toContain(issued.raw);
  });

  it('creates a SERVICE principal and adds it as a member with the Integration role', async () => {
    await service.issue(PROJECT_ID, { name: 'MyTracker', expiresAt: null }, CREATOR_ID);

    expect(usersRepo.createServicePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyTracker' }),
      expect.anything(),
    );
    expect(membersRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'svc-1',
        projectId: PROJECT_ID,
        roleId: INTEGRATION_ROLE_ID,
      }),
      expect.anything(),
    );
  });

  it('revoking a key removes the principal from the project', async () => {
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: PROJECT_ID,
      userId: 'svc-1',
      name: 'MyTracker',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });

    await service.revoke(PROJECT_ID, 'key-1');

    expect(repo.revoke).toHaveBeenCalledWith('key-1', expect.anything());
    expect(membersRepo.remove).toHaveBeenCalledWith('svc-1', PROJECT_ID, expect.anything());
  });

  it('refuses to revoke a key belonging to another project', async () => {
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: 'cccccccc-0000-0000-0000-000000000001',
      userId: 'svc-1',
      name: 'Other',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });

    await expect(service.revoke(PROJECT_ID, 'key-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(repo.revoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-keys.service`
Expected: FAIL — cannot find module `./api-keys.service`.

- [ ] **Step 4: Add the repository methods the service needs**

`revoke` and `create` must join the same transaction as the membership change, and `UsersRepository` needs a service-principal creator. Add to `apps/api/src/modules/api-keys/api-keys.repository.ts` a `tx` parameter on `create` and `revoke`, following the transaction-handle convention already used by `IssuesRepository`:

```typescript
  create(input: ApiKeyCreateInput, tx?: PrismaTransaction): Promise<ApiKeyRow> {
    return (tx ?? this.prisma).projectApiKey.create({ data: input, select: ROW_SELECT });
  }

  async revoke(id: string, tx?: PrismaTransaction): Promise<void> {
    await (tx ?? this.prisma).projectApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
```

Import the transaction handle type the repositories in this codebase already use (read `apps/api/src/modules/issues/issues.repository.ts` for the exact import and alias, and reuse it verbatim).

Add to `apps/api/src/modules/users/users.repository.ts`:

```typescript
  createServicePrincipal(
    input: { name: string; email: string },
    tx?: PrismaTransaction,
  ): Promise<{ id: string }> {
    return (tx ?? this.prisma).user.create({
      data: {
        name: input.name,
        email: input.email,
        kind: UserKind.SERVICE,
        passwordHash: null,
        hasPassword: false,
      },
      select: { id: true },
    });
  }
```

Import `UserKind` from `@prisma/client`.

- [ ] **Step 5: Write the service**

Create `apps/api/src/modules/api-keys/api-keys.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ErrorCode } from '@repo/shared';
import { AppLogger } from '@/common/logging/app-logger';
import { ConflictError, NotFoundError } from '@/common/errors/domain.errors';
import { PermissionsCacheService } from '@/common/permissions/permissions-cache.service';
import { TransactionService } from '@/prisma/transaction.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { ProjectMembersRepository } from '@/modules/projects/projects-members.repository';
import { ApiKeyRow, ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './api-key-token';
import { INTEGRATION_ROLE_ID } from './integration-role';

export interface IssuedApiKey {
  key: ApiKeyRow;
  /** Returned to the caller once, at creation. Never persisted, never logged. */
  raw: string;
}

const PRINCIPAL_EMAIL_DOMAIN = 'integrations.invalid';

@Injectable()
export class ApiKeysService {
  private readonly logger = new AppLogger(ApiKeysService.name);

  constructor(
    private repo: ApiKeysRepository,
    private usersRepo: UsersRepository,
    private membersRepo: ProjectMembersRepository,
    private txService: TransactionService,
    private permissionsCache: PermissionsCacheService,
  ) {}

  async issue(
    projectId: string,
    input: { name: string; expiresAt: Date | null },
    createdById: string,
  ): Promise<IssuedApiKey> {
    const { raw, prefix, hash } = generateApiKey();

    const key = await this.txService.run(async (tx) => {
      const principal = await this.usersRepo.createServicePrincipal(
        { name: input.name, email: this.principalEmail() },
        tx,
      );
      await this.membersRepo.add(
        { userId: principal.id, projectId, roleId: INTEGRATION_ROLE_ID, invitedBy: createdById },
        tx,
      );
      return this.repo.create(
        {
          projectId,
          userId: principal.id,
          name: input.name,
          prefix,
          tokenHash: hash,
          expiresAt: input.expiresAt,
          createdById,
        },
        tx,
      );
    });

    await this.permissionsCache.invalidateAll();
    this.logger.log('API key issued', {
      projectId,
      keyId: key.id,
      principalId: key.userId,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    });

    return { key, raw };
  }

  list(projectId: string): Promise<ApiKeyRow[]> {
    return this.repo.listByProject(projectId);
  }

  async revoke(projectId: string, keyId: string): Promise<void> {
    const key = await this.repo.findById(keyId);
    if (!key || key.projectId !== projectId) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }
    if (key.revokedAt) {
      throw new ConflictError(ErrorCode.CONFLICT, 'Key is already revoked');
    }

    await this.txService.run(async (tx) => {
      await this.repo.revoke(keyId, tx);
      await this.membersRepo.remove(key.userId, projectId, tx);
    });

    await this.permissionsCache.invalidateAll();
    this.logger.log('API key revoked', {
      projectId,
      keyId,
      principalId: key.userId,
    });
  }

  private principalEmail(): string {
    return `svc.${randomBytes(8).toString('hex')}@${PRINCIPAL_EMAIL_DOMAIN}`;
  }
}
```

Read `apps/api/src/modules/projects/projects-members.repository.ts` first and match the real signatures of its add/remove methods; if they do not accept a `tx` handle, add the optional parameter the same way the other repositories in this codebase do.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-keys.service`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && pnpm check-types`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/api-keys apps/api/src/modules/users apps/api/src/modules/projects packages/shared/src/enums/error-codes.enum.ts
git commit -m "feat(api): issue, list and revoke project API keys"
```

---

## Task 5: Authenticate with `X-Api-Key`

**Files:**
- Create: `apps/api/src/common/http/integration-request.ts`
- Create: `apps/api/src/modules/api-keys/api-key-auth.service.ts`
- Test: `apps/api/src/modules/api-keys/api-key-auth.service.spec.ts`
- Modify: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Test: `apps/api/src/common/guards/jwt-auth.guard.spec.ts`
- Create: `apps/api/src/modules/api-keys/api-keys.module.ts`

**Interfaces:**
- Consumes: `ApiKeysRepository`, `hashApiKey`, `BackgroundTasks` (`@/common/background`), `setRequestUserId` (`@/common/context/request-context`).
- Produces:
  - `API_KEY_HEADER = 'x-api-key'`
  - `IntegrationRequest` — `{ headers, user?: RequestUser & { kind: UserKind }, apiKeyId?: string }`
  - `ApiKeyAuthService.authenticate(req: IntegrationRequest, presented: string): Promise<boolean>` — throws `UnauthorizedException(ErrorCode.API_KEY_INVALID)` on any failure.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/api-keys/api-key-auth.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { GlobalRole, UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysRepository, ApiKeyPrincipalRow } from './api-keys.repository';
import { hashApiKey } from './api-key-token';
import { BackgroundTasks } from '@/common/background';
import type { IntegrationRequest } from '@/common/http/integration-request';

const RAW = 'nt_test_key_value';

function principal(overrides: Partial<ApiKeyPrincipalRow> = {}): ApiKeyPrincipalRow {
  return {
    id: 'key-1',
    userId: 'svc-1',
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    user: {
      id: 'svc-1',
      email: 'svc.abc@integrations.invalid',
      name: 'MyTracker',
      avatarUrl: null,
      role: GlobalRole.USER,
      kind: UserKind.SERVICE,
      isBlocked: false,
      deletedAt: null,
    },
    ...overrides,
  };
}

describe('ApiKeyAuthService', () => {
  let service: ApiKeyAuthService;
  let repo: jest.Mocked<ApiKeysRepository>;
  let background: { run: jest.Mock };
  let req: IntegrationRequest;

  beforeEach(async () => {
    repo = {
      findActiveByHash: jest.fn().mockResolvedValue(principal()),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ApiKeysRepository>;
    background = { run: jest.fn() };
    req = { headers: {} } as IntegrationRequest;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeyAuthService,
        { provide: ApiKeysRepository, useValue: repo },
        { provide: BackgroundTasks, useValue: background },
      ],
    }).compile();

    service = moduleRef.get(ApiKeyAuthService);
  });

  it('looks the key up by hash, never by the raw value', async () => {
    await service.authenticate(req, RAW);
    expect(repo.findActiveByHash).toHaveBeenCalledWith(hashApiKey(RAW));
  });

  it('populates the request principal and key id on success', async () => {
    await expect(service.authenticate(req, RAW)).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: 'svc-1', kind: UserKind.SERVICE });
    expect(req.apiKeyId).toBe('key-1');
  });

  it.each([
    ['unknown key', null],
    ['revoked key', principal({ revokedAt: new Date('2020-01-01') })],
    ['expired key', principal({ expiresAt: new Date('2020-01-01') })],
    ['blocked principal', principal({ user: { ...principal().user, isBlocked: true } })],
    ['deleted principal', principal({ user: { ...principal().user, deletedAt: new Date() } })],
    ['human principal', principal({ user: { ...principal().user, kind: UserKind.HUMAN } })],
  ])('rejects a %s with an indistinguishable error', async (_label, row) => {
    repo.findActiveByHash.mockResolvedValue(row);

    await expect(service.authenticate(req, RAW)).rejects.toThrow(UnauthorizedException);
    await expect(service.authenticate(req, RAW)).rejects.toMatchObject({
      response: ErrorCode.API_KEY_INVALID,
    });
    expect(req.user).toBeUndefined();
  });

  it('touches lastUsedAt through BackgroundTasks, not inline', async () => {
    await service.authenticate(req, RAW);
    expect(background.run).toHaveBeenCalled();
    expect(repo.touchLastUsed).not.toHaveBeenCalled();
  });

  it('does not touch lastUsedAt again inside the throttle window', async () => {
    repo.findActiveByHash.mockResolvedValue(principal({ lastUsedAt: new Date() }));
    await service.authenticate(req, RAW);
    expect(background.run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-auth.service`
Expected: FAIL — cannot find module `./api-key-auth.service`.

- [ ] **Step 3: Define the request shape**

Create `apps/api/src/common/http/integration-request.ts`:

```typescript
import type { IncomingHttpHeaders } from 'node:http';
import type { UserKind } from '@prisma/client';
import type { RequestUser } from '@/common/decorators/current-user.decorator';

export const API_KEY_HEADER = 'x-api-key';

/** Request fields this feature adds, typed so no call site needs a cast. */
export interface IntegrationRequest {
  headers: IncomingHttpHeaders;
  user?: RequestUser & { kind: UserKind };
  apiKeyId?: string;
}
```

- [ ] **Step 4: Write the auth service**

Create `apps/api/src/modules/api-keys/api-key-auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { AppLogger } from '@/common/logging/app-logger';
import { BackgroundTasks } from '@/common/background';
import { setRequestUserId } from '@/common/context/request-context';
import type { IntegrationRequest } from '@/common/http/integration-request';
import { ApiKeysRepository } from './api-keys.repository';
import { hashApiKey } from './api-key-token';

/**
 * Writing lastUsedAt on every request would turn a busy integration into one
 * UPDATE per call against a single row, for a field a human reads occasionally.
 */
const LAST_USED_THROTTLE_MS = 60_000;

@Injectable()
export class ApiKeyAuthService {
  private readonly logger = new AppLogger(ApiKeyAuthService.name);

  constructor(
    private repo: ApiKeysRepository,
    private background: BackgroundTasks,
  ) {}

  async authenticate(req: IntegrationRequest, presented: string): Promise<boolean> {
    const row = await this.repo.findActiveByHash(hashApiKey(presented));
    const now = new Date();

    // One error for every failure mode: distinct codes would confirm to an
    // attacker that a guessed key exists.
    if (
      !row ||
      row.revokedAt !== null ||
      (row.expiresAt !== null && row.expiresAt <= now) ||
      row.user.kind !== UserKind.SERVICE ||
      row.user.isBlocked ||
      row.user.deletedAt !== null
    ) {
      this.logger.warn('API key rejected', { keyId: row?.id ?? null });
      throw new UnauthorizedException(ErrorCode.API_KEY_INVALID);
    }

    req.user = {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      avatarUrl: row.user.avatarUrl,
      kind: row.user.kind,
    };
    req.apiKeyId = row.id;
    setRequestUserId(row.user.id);

    if (this.shouldTouch(row.lastUsedAt, now)) {
      this.background.run(
        () => this.repo.touchLastUsed(row.id, now),
        (err) => this.logger.error('Failed to update API key lastUsedAt', err, { keyId: row.id }),
      );
    }

    return true;
  }

  private shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
    return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-auth.service`
Expected: PASS (11 assertions across 6 test cases, including all six rejection rows).

- [ ] **Step 6: Write the failing guard test**

Create `apps/api/src/common/guards/jwt-auth.guard.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyAuthService } from '@/modules/api-keys/api-key-auth.service';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let apiKeyAuth: { authenticate: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    apiKeyAuth = { authenticate: jest.fn().mockResolvedValue(true) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    guard = new JwtAuthGuard(reflector, apiKeyAuth as unknown as ApiKeyAuthService);
  });

  it('delegates to the API-key path when the header is present', async () => {
    await expect(guard.canActivate(contextWith({ 'x-api-key': 'nt_abc' }))).resolves.toBe(true);
    expect(apiKeyAuth.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
      'nt_abc',
    );
  });

  it('ignores an empty header value and falls through to the cookie/JWT path', async () => {
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockResolvedValue(true);

    await guard.canActivate(contextWith({ 'x-api-key': '' }));

    expect(apiKeyAuth.authenticate).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run the guard test to verify it fails**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=jwt-auth.guard`
Expected: FAIL — the constructor takes one argument, so `ApiKeyAuthService` is not injected.

- [ ] **Step 8: Wire the guard**

Replace the body of `apps/api/src/common/guards/jwt-auth.guard.ts`:

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { API_KEY_HEADER, IntegrationRequest } from '@/common/http/integration-request';
import { ApiKeyAuthService } from '@/modules/api-keys/api-key-auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private apiKeyAuth: ApiKeyAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<IntegrationRequest>();
    const presented = req.headers[API_KEY_HEADER];
    if (typeof presented === 'string' && presented.length > 0) {
      return this.apiKeyAuth.authenticate(req, presented);
    }

    return (await super.canActivate(context)) as boolean;
  }
}
```

- [ ] **Step 9: Create the module and make the service globally available**

Create `apps/api/src/modules/api-keys/api-keys.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/modules/users/users.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysController } from './api-keys.controller';

/**
 * Global because JwtAuthGuard — used by every module through @ProjectAuth() —
 * injects ApiKeyAuthService. A non-global module would force every consumer to
 * import this one.
 */
@Global()
@Module({
  imports: [PrismaModule, UsersModule, ProjectsModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysRepository, ApiKeysService, ApiKeyAuthService],
  exports: [ApiKeyAuthService, ApiKeysService],
})
export class ApiKeysModule {}
```

`ApiKeysController` does not exist until Task 9. Until then, omit the `controllers` line and its import, and add both in Task 9.

Register `ApiKeysModule` in the `imports` array of `apps/api/src/app.module.ts`.

- [ ] **Step 10: Run both suites and typecheck**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern="jwt-auth.guard|api-key"`
Expected: PASS.

Run: `cd apps/api && pnpm check-types`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): authenticate machine callers with X-Api-Key"
```

---

## Task 6: Protect the service member from hand removal

**Files:**
- Modify: `apps/api/src/modules/projects/projects-members.service.ts`
- Test: `apps/api/src/modules/projects/projects-members.service.spec.ts`

**Interfaces:**
- Consumes: `ApiKeysRepository.countActiveForUser(userId)`, `UsersReader` for the member's `kind`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/projects/projects-members.service.spec.ts`:

```typescript
describe('removeMember — service principals', () => {
  it('refuses to remove a SERVICE member that still has an active key', async () => {
    membersRepo.findOne.mockResolvedValue(
      buildProjectMember({ userId: 'svc-1', projectId: project.id, roleId: INTEGRATION_ROLE_ID }),
    );
    usersReader.findKind.mockResolvedValue(UserKind.SERVICE);
    apiKeysRepo.countActiveForUser.mockResolvedValue(1);

    await expect(service.removeMember(project, 'svc-1')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_MEMBER_HAS_ACTIVE_KEY,
    });
    expect(membersRepo.removeWithCleanup).not.toHaveBeenCalled();
  });

  it('allows removing a SERVICE member whose keys are all revoked', async () => {
    membersRepo.findOne.mockResolvedValue(
      buildProjectMember({ userId: 'svc-1', projectId: project.id, roleId: INTEGRATION_ROLE_ID }),
    );
    usersReader.findKind.mockResolvedValue(UserKind.SERVICE);
    apiKeysRepo.countActiveForUser.mockResolvedValue(0);

    await service.removeMember(project, 'svc-1');

    expect(membersRepo.removeWithCleanup).toHaveBeenCalledWith('svc-1', project.id);
  });

  it('does not query keys for a human member', async () => {
    membersRepo.findOne.mockResolvedValue(buildProjectMember({ userId: 'human-1' }));
    usersReader.findKind.mockResolvedValue(UserKind.HUMAN);

    await service.removeMember(project, 'human-1');

    expect(apiKeysRepo.countActiveForUser).not.toHaveBeenCalled();
  });
});
```

Add `apiKeysRepo` and `usersReader` mocks to the existing `beforeEach` provider list, with `countActiveForUser: jest.fn().mockResolvedValue(0)` and `findKind: jest.fn().mockResolvedValue(UserKind.HUMAN)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=projects-members.service -t "service principals"`
Expected: FAIL — `usersReader.findKind` is not a function / the guard does not exist.

- [ ] **Step 3: Add the reader method**

In `apps/api/src/modules/users/users.reader.ts`:

```typescript
  async findKind(userId: string): Promise<UserKind | null> {
    const row = await this.repo.findKind(userId);
    return row?.kind ?? null;
  }
```

In `apps/api/src/modules/users/users.repository.ts`:

```typescript
  findKind(userId: string): Promise<{ kind: UserKind } | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { kind: true } });
  }
```

- [ ] **Step 4: Add the guard to `removeMember`**

In `apps/api/src/modules/projects/projects-members.service.ts`, inside `removeMember`, after the existing `if (!member)` check and before the last-admin check:

```typescript
    // Removal of an integration principal must go through key revocation.
    // Allowing it here means someone silently breaks a live integration from
    // the members screen, with no signal that anything stopped working.
    if ((await this.usersReader.findKind(userId)) === UserKind.SERVICE) {
      const activeKeys = await this.apiKeysRepo.countActiveForUser(userId);
      if (activeKeys > 0) {
        throw new ConflictError(
          ErrorCode.SERVICE_MEMBER_HAS_ACTIVE_KEY,
          'Revoke the API key instead of removing its principal',
        );
      }
    }
```

Add `UsersReader` and `ApiKeysRepository` to the constructor, and `UserKind` plus `ConflictError` to the imports.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=projects-members.service`
Expected: PASS, including pre-existing member tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/projects apps/api/src/modules/users
git commit -m "feat(api): block hand removal of service members with live keys"
```

---

## Task 7: `dedupKey` — schema, race, response

**Files:**
- Modify: `packages/shared/src/schemas/issue.schema.ts`
- Test: `packages/shared/src/schemas/issue.schema.test.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_issue_dedup_key/migration.sql`
- Modify: `apps/api/test/support/global-setup.ts`
- Modify: `apps/api/src/modules/issues/issues.repository.ts`
- Modify: `apps/api/src/modules/issues/issues.service.ts`
- Test: `apps/api/src/modules/issues/issues.service.spec.ts`
- Modify: `apps/api/src/modules/issues/issues.controller.ts`
- Test: `apps/api/test/api-keys.integration-spec.ts`

**Interfaces:**
- Consumes: `CreateIssueParsed` gains `dedupKey?: string`.
- Produces:
  - `IssuesRepository.findByDedupKey(projectId: string, dedupKey: string): Promise<{ id: string } | null>`
  - `IssuesService.create(...)` returns `{ issue: IssueDetail; deduplicated: boolean }`

- [ ] **Step 1: Write the failing schema test**

Add to `packages/shared/src/schemas/issue.schema.test.ts`:

```typescript
it('trims dedupKey and rejects blank or oversized values', () => {
  expect(createIssueSchema.safeParse({ title: 'x', dedupKey: '  g-1  ' }).data?.dedupKey).toBe('g-1');
  expect(createIssueSchema.safeParse({ title: 'x', dedupKey: '   ' }).success).toBe(false);
  expect(createIssueSchema.safeParse({ title: 'x', dedupKey: 'a'.repeat(201) }).success).toBe(false);
  expect(createIssueSchema.safeParse({ title: 'x' }).success).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/shared && pnpm test -- issue.schema`
Expected: FAIL — `dedupKey` is stripped, so the first assertion receives `undefined`.

- [ ] **Step 3: Add the field**

In `packages/shared/src/schemas/issue.schema.ts`, add a constant next to the other issue limits and the field to `createIssueSchema`:

```typescript
export const ISSUE_DEDUP_KEY_MAX = 200;
```

```typescript
  dedupKey: z.string().trim().min(1).max(ISSUE_DEDUP_KEY_MAX).optional(),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/shared && pnpm test -- issue.schema`
Expected: PASS.

- [ ] **Step 5: Add the column and the partial index**

In `apps/api/prisma/schema.prisma`, in `model Issue`:

```prisma
  dedupKey String? @map("dedup_key") @db.VarChar(200)
```

```bash
cd apps/api && pnpm prisma migrate dev --name add_issue_dedup_key --create-only
```

Append to the generated `migration.sql`:

```sql
-- Partial so a soft-deleted issue does not hold its key forever: without the
-- WHERE clause a deleted issue would permanently block its source from ever
-- opening a new one, with no way to fix it from the UI.
CREATE UNIQUE INDEX "issues_project_dedup_key_unique"
  ON "issues" ("project_id", "dedup_key")
  WHERE "deleted_at" IS NULL;
```

Apply it:

```bash
cd apps/api && pnpm prisma migrate dev
```

- [ ] **Step 6: Teach the integration harness about the index**

`apps/api/test/support/global-setup.ts` builds its schema with `prisma db push`, which skips partial indexes declared only in migration SQL. Without this step the concurrency test in Step 13 passes while proving nothing.

Directly after the `execSync('npx prisma db push --force-reset', …)` call, add:

```typescript
  // `db push` does not create migration-only partial indexes. The dedup race
  // test depends on this one, so create it explicitly or that test is vacuous.
  execSync(
    `npx prisma db execute --url "${dbUrl}" --stdin`,
    {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: process.cwd(),
      input:
        'CREATE UNIQUE INDEX IF NOT EXISTS "issues_project_dedup_key_unique" ' +
        'ON "issues" ("project_id", "dedup_key") WHERE "deleted_at" IS NULL;',
      stdio: 'pipe',
    },
  );
```

- [ ] **Step 7: Write the failing service tests**

Add to `apps/api/src/modules/issues/issues.service.spec.ts`:

```typescript
describe('create — dedupKey', () => {
  it('returns the existing issue without creating a second one on a fast-path hit', async () => {
    issuesRepo.findByDedupKey.mockResolvedValue({ id: 'existing-1' });
    issuesRepo.findDetailById.mockResolvedValue(buildIssueDetailRow({ id: 'existing-1' }));

    const result = await service.create(project, { title: 'boom', dedupKey: 'g-1' }, USER_ID);

    expect(result.deduplicated).toBe(true);
    expect(result.issue.id).toBe('existing-1');
    expect(issuesRepo.createWithDetails).not.toHaveBeenCalled();
  });

  it('recovers from a lost insert race by returning the winner', async () => {
    issuesRepo.findByDedupKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner-1' });
    txService.run.mockRejectedValue(
      Object.assign(new Error('unique violation'), { code: 'P2002' }),
    );
    issuesRepo.findDetailById.mockResolvedValue(buildIssueDetailRow({ id: 'winner-1' }));

    const result = await service.create(project, { title: 'boom', dedupKey: 'g-1' }, USER_ID);

    expect(result.deduplicated).toBe(true);
    expect(result.issue.id).toBe('winner-1');
  });

  it('rethrows a P2002 that is not about the dedup key', async () => {
    issuesRepo.findByDedupKey.mockResolvedValue(null).mockResolvedValue(null);
    txService.run.mockRejectedValue(
      Object.assign(new Error('unique violation'), { code: 'P2002' }),
    );

    await expect(
      service.create(project, { title: 'boom', dedupKey: 'g-1' }, USER_ID),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('skips the dedup lookup entirely when no key is supplied', async () => {
    await service.create(project, { title: 'boom' }, USER_ID);
    expect(issuesRepo.findByDedupKey).not.toHaveBeenCalled();
  });
});
```

Add `findByDedupKey: jest.fn().mockResolvedValue(null)` and `findDetailById` to the `issuesRepo` mock in the file's `beforeEach`. If `buildIssueDetailRow` does not exist in `@test/helpers/factories.ts`, add it there following the pattern of the existing builders — a full row shaped for `toIssueDetail`, with `...overrides` last.

- [ ] **Step 8: Run them to verify they fail**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=issues.service -t "dedupKey"`
Expected: FAIL — `issuesRepo.findByDedupKey` is not a function.

- [ ] **Step 9: Add the repository lookup**

In `apps/api/src/modules/issues/issues.repository.ts`:

```typescript
  findByDedupKey(projectId: string, dedupKey: string): Promise<{ id: string } | null> {
    return this.prisma.issue.findFirst({
      where: { projectId, dedupKey, deletedAt: null },
      select: { id: true },
    });
  }
```

The `deletedAt: null` predicate must match the partial index exactly, or Postgres cannot use it.

- [ ] **Step 10: Implement the dedup path**

In `apps/api/src/modules/issues/issues.service.ts`, change the `create` signature's return type to `Promise<{ issue: IssueDetail; deduplicated: boolean }>` and add the fast path at the very top of the method:

```typescript
    if (dto.dedupKey) {
      const existing = await this.issuesRepo.findByDedupKey(project.id, dto.dedupKey);
      if (existing) {
        return { issue: await this.detailById(existing.id, userId), deduplicated: true };
      }
    }
```

Pass `dedupKey: dto.dedupKey ?? null` into the `createWithDetails` payload alongside the other fields.

Wrap the existing `await this.txService.run(...)` call so a lost race resolves instead of surfacing as a conflict:

```typescript
    let issue: Awaited<ReturnType<typeof this.issuesRepo.createWithDetails>>;
    try {
      issue = await this.txService.run(async (tx) => {
        /* the existing transaction body, unchanged */
      });
    } catch (err) {
      // A concurrent caller won the insert. The transaction has already rolled
      // back in full — including its outbox event — so nothing partial exists
      // and nothing is being continued inside a dead transaction.
      if (dto.dedupKey && isUniqueViolation(err)) {
        const winner = await this.issuesRepo.findByDedupKey(project.id, dto.dedupKey);
        if (winner) {
          this.logger.log('Issue create deduplicated after insert race', {
            projectId: project.id,
            issueId: winner.id,
          });
          return { issue: await this.detailById(winner.id, userId), deduplicated: true };
        }
      }
      throw err;
    }
```

Add the private helper at the bottom of the class and a small predicate above it:

```typescript
  private async detailById(issueId: string, userId: string): Promise<IssueDetail> {
    const row = await this.issuesRepo.findDetailById(issueId);
    if (!row) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    const workflow = await this.requireDefaultWorkflow(row.projectId);
    return toIssueDetail(row, workflow.statuses, userId);
  }
```

```typescript
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
  );
}
```

Change the final `return toIssueDetail(issue, workflow.statuses, userId);` to `return { issue: toIssueDetail(issue, workflow.statuses, userId), deduplicated: false };`.

If `findDetailById` does not already exist on `IssuesRepository`, add it with the same `select`/`include` shape `createWithDetails` returns, so `toIssueDetail` receives an identical row.

- [ ] **Step 11: Run the service tests to verify they pass**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=issues.service`
Expected: PASS. Pre-existing `create` tests now read `result.issue`; update their assertions accordingly in the same step.

- [ ] **Step 12: Surface the flag in the controller**

In `apps/api/src/modules/issues/issues.controller.ts`, replace the `create` handler:

```typescript
  @Post()
  @RequirePermission(Permission.ISSUE_CREATE)
  @ApiEnvelope(IssueDetailDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateIssueDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { issue, deduplicated } = await this.issuesService.create(project, dto, userId);
    // 201 Created would be a lie for a request that created nothing.
    res.status(deduplicated ? HttpStatus.OK : HttpStatus.CREATED);
    return deduplicated ? { data: issue, meta: { deduplicated: true } } : { data: issue };
  }
```

Import `Res` from `@nestjs/common` and `Response` from `express`. Update every other caller of `issuesService.create` in the codebase to destructure `{ issue }` — search with `grep -rn "issuesService.create\|issuesService\.create" apps/api/src` and fix each site.

- [ ] **Step 13: Write the integration test for the race**

Create `apps/api/test/api-keys.integration-spec.ts`. Follow an existing integration spec (for example `apps/api/test/authz.integration-spec.ts`) for the harness boilerplate — app creation, truncation between cases, project and role setup — then add:

```typescript
it('creates once, then returns the same issue for a repeated dedupKey', async () => {
  const first = await request(app.getHttpServer())
    .post(`/projects/${projectKey}/issues`)
    .set('X-Api-Key', rawKey)
    .send({ title: 'TypeError: null', dedupKey: 'group-abc' });

  expect(first.status).toBe(201);

  const second = await request(app.getHttpServer())
    .post(`/projects/${projectKey}/issues`)
    .set('X-Api-Key', rawKey)
    .send({ title: 'TypeError: null', dedupKey: 'group-abc' });

  expect(second.status).toBe(200);
  expect(second.body.meta.deduplicated).toBe(true);
  expect(second.body.data.id).toBe(first.body.data.id);
});

it('two concurrent requests with one dedupKey produce exactly one issue', async () => {
  const send = () =>
    request(app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'race', dedupKey: 'group-race' });

  const [a, b] = await Promise.all([send(), send()]);

  expect([a.status, b.status].sort()).toEqual([200, 201]);
  expect(a.body.data.id).toBe(b.body.data.id);

  const count = await prisma.issue.count({
    where: { dedupKey: 'group-race', deletedAt: null },
  });
  expect(count).toBe(1);
});

it('frees the key when the issue is soft-deleted', async () => {
  const created = await request(app.getHttpServer())
    .post(`/projects/${projectKey}/issues`)
    .set('X-Api-Key', rawKey)
    .send({ title: 'noise', dedupKey: 'group-noise' });

  await prisma.issue.update({
    where: { id: created.body.data.id },
    data: { deletedAt: new Date() },
  });

  const again = await request(app.getHttpServer())
    .post(`/projects/${projectKey}/issues`)
    .set('X-Api-Key', rawKey)
    .send({ title: 'noise', dedupKey: 'group-noise' });

  expect(again.status).toBe(201);
  expect(again.body.data.id).not.toBe(created.body.data.id);
});
```

- [ ] **Step 14: Run the integration suite**

Start the stack if it is not already running (`cd infra && docker compose up -d postgres valkey minio elasticsearch`), then:

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=api-keys`
Expected: PASS. If the concurrency test reports a count of 2, the partial index is missing — re-check Step 6.

- [ ] **Step 15: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): deduplicate issue creation by caller-supplied dedupKey"
```

---

## Task 8: Rate limiting for machine callers

**Files:**
- Create: `apps/api/src/config/throttle.config.ts`
- Modify: `apps/api/src/config/index.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/guards/api-key-aware-throttler.guard.ts`
- Test: `apps/api/src/common/guards/api-key-aware-throttler.guard.spec.ts`

**Interfaces:**
- Consumes: `hashApiKey`, `API_KEY_HEADER`.
- Produces:
  - `throttleConfig` with `{ shortLimit, shortTtl, mediumLimit, mediumTtl, longLimit, longTtl }`
  - `ApiKeyAwareThrottlerGuard.rememberVerifiedKey(hash: string, keyId: string): void`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/guards/api-key-aware-throttler.guard.spec.ts`:

```typescript
import { ApiKeyAwareThrottlerGuard } from './api-key-aware-throttler.guard';
import { hashApiKey } from '@/modules/api-keys/api-key-token';

describe('ApiKeyAwareThrottlerGuard', () => {
  const RAW = 'nt_verified_key';
  let guard: ApiKeyAwareThrottlerGuard;

  beforeEach(() => {
    guard = Object.create(ApiKeyAwareThrottlerGuard.prototype) as ApiKeyAwareThrottlerGuard;
    ApiKeyAwareThrottlerGuard.verifiedKeys.clear();
  });

  it('buckets a verified key by its key id, not the caller IP', async () => {
    ApiKeyAwareThrottlerGuard.rememberVerifiedKey(hashApiKey(RAW), 'key-1');

    const tracker = await guard['getTracker']({
      headers: { 'x-api-key': RAW },
      ip: '10.0.0.1',
    });

    expect(tracker).toBe('apikey:key-1');
  });

  it('falls back to the IP for an unknown key so a rotating fake header cannot mint buckets', async () => {
    const tracker = await guard['getTracker']({
      headers: { 'x-api-key': 'nt_never_seen' },
      ip: '10.0.0.1',
    });

    expect(tracker).toBe('10.0.0.1');
  });

  it('uses the IP when no key header is present', async () => {
    const tracker = await guard['getTracker']({ headers: {}, ip: '10.0.0.2' });
    expect(tracker).toBe('10.0.0.2');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-aware-throttler`
Expected: FAIL — cannot find module `./api-key-aware-throttler.guard`.

- [ ] **Step 3: Write the guard**

Create `apps/api/src/common/guards/api-key-aware-throttler.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { API_KEY_HEADER } from '@/common/http/integration-request';
import { hashApiKey } from '@/modules/api-keys/api-key-token';

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

const VERIFIED_KEY_TTL_MS = 5 * 60_000;

/**
 * Machine callers get their own throttle bucket instead of sharing the IP
 * bucket with humans behind the same NAT. Only keys that have already
 * authenticated successfully are bucketed this way — otherwise a caller could
 * rotate a fake header value to mint an unlimited number of fresh buckets.
 */
@Injectable()
export class ApiKeyAwareThrottlerGuard extends ThrottlerGuard {
  static readonly verifiedKeys = new Map<string, { keyId: string; seenAt: number }>();

  static rememberVerifiedKey(hash: string, keyId: string): void {
    ApiKeyAwareThrottlerGuard.verifiedKeys.set(hash, { keyId, seenAt: Date.now() });
  }

  protected async getTracker(req: TrackedRequest): Promise<string> {
    const presented = req.headers[API_KEY_HEADER];
    if (typeof presented === 'string' && presented.length > 0) {
      const entry = ApiKeyAwareThrottlerGuard.verifiedKeys.get(hashApiKey(presented));
      if (entry && Date.now() - entry.seenAt < VERIFIED_KEY_TTL_MS) {
        return `apikey:${entry.keyId}`;
      }
    }
    return req.ip ?? 'unknown';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test:unit -- --testPathPattern=api-key-aware-throttler`
Expected: PASS (3 tests).

- [ ] **Step 5: Populate the cache from the auth path**

In `apps/api/src/modules/api-keys/api-key-auth.service.ts`, in `authenticate`, immediately after `req.apiKeyId = row.id;`:

```typescript
    ApiKeyAwareThrottlerGuard.rememberVerifiedKey(hashApiKey(presented), row.id);
```

- [ ] **Step 6: Move the throttler limits into typed config**

Create `apps/api/src/config/throttle.config.ts`:

```typescript
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  shortTtl: z.coerce.number().int().min(100).max(60_000).default(1_000),
  shortLimit: z.coerce.number().int().min(1).max(10_000).default(3),
  mediumTtl: z.coerce.number().int().min(1_000).max(600_000).default(10_000),
  mediumLimit: z.coerce.number().int().min(1).max(100_000).default(20),
  longTtl: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  longLimit: z.coerce.number().int().min(1).max(1_000_000).default(100),
});

export type ThrottleConfig = z.infer<typeof schema>;

export const throttleConfig = registerAs('throttle', (): ThrottleConfig => {
  return schema.parse({
    shortTtl: process.env.THROTTLE_SHORT_TTL_MS,
    shortLimit: process.env.THROTTLE_SHORT_LIMIT,
    mediumTtl: process.env.THROTTLE_MEDIUM_TTL_MS,
    mediumLimit: process.env.THROTTLE_MEDIUM_LIMIT,
    longTtl: process.env.THROTTLE_LONG_TTL_MS,
    longLimit: process.env.THROTTLE_LONG_LIMIT,
  });
});
```

Re-export it from `apps/api/src/config/index.ts`:

```typescript
export { throttleConfig, ThrottleConfig } from './throttle.config';
```

Add `throttleConfig` to the `ConfigModule.forRoot` `load` array in `apps/api/src/app.module.ts`.

- [ ] **Step 7: Wire config and guard into `app.module.ts`**

Replace the `ThrottlerModule.forRoot(...)` call with the async form so the limits come from config, keeping the test-environment bypass exactly as it is today:

```typescript
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (t: ConfigType<typeof throttleConfig>) =>
        process.env.NODE_ENV === 'test'
          ? [{ name: 'default', ttl: 0, limit: 0 }]
          : [
              { name: 'short', ttl: t.shortTtl, limit: t.shortLimit },
              { name: 'medium', ttl: t.mediumTtl, limit: t.mediumLimit },
              { name: 'long', ttl: t.longTtl, limit: t.longLimit },
            ],
    }),
```

Change the `APP_GUARD` provider from `useClass: ThrottlerGuard` to `useClass: ApiKeyAwareThrottlerGuard`.

- [ ] **Step 8: Verify the whole unit suite and types**

Run: `cd apps/api && pnpm test:unit`
Expected: PASS.

Run: `cd apps/api && pnpm check-types`
Expected: no errors.

Note on coverage: throttling cannot be exercised by an integration test in this
repository. `app.module.ts` replaces all three buckets with
`{ name: 'default', ttl: 0, limit: 0 }` when `NODE_ENV === 'test'`, so the guard
never rejects under the harness. The unit tests above cover the only logic this
task adds — bucket selection. Do not add an integration test that asserts a 429;
it would pass for the wrong reason or hang waiting for a limit that is disabled.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): per-key throttle buckets and configurable rate limits"
```

---

## Task 9: HTTP layer for key management

**Files:**
- Create: `apps/api/src/modules/api-keys/api-keys.dto.ts`
- Create: `apps/api/src/modules/api-keys/api-keys.controller.ts`
- Modify: `apps/api/src/modules/api-keys/api-keys.module.ts`
- Modify: `packages/shared/src/schemas/index.ts` and a new `packages/shared/src/schemas/api-key.schema.ts`
- Test: `apps/api/test/api-keys.integration-spec.ts` (extend the file created in Task 7)

**Interfaces:**
- Consumes: `ApiKeysService`.
- Produces: `POST|GET /api/projects/:key/api-keys`, `DELETE /api/projects/:key/api-keys/:keyId`.

- [ ] **Step 1: Write the failing integration tests**

Add to `apps/api/test/api-keys.integration-spec.ts`:

```typescript
describe('key management endpoints', () => {
  it('returns the raw secret only on creation', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/api-keys`)
      .set('Cookie', adminCookie)
      .send({ name: 'MyTracker' });

    expect(created.status).toBe(201);
    expect(created.body.data.raw).toMatch(/^nt_/);

    const listed = await request(app.getHttpServer())
      .get(`/projects/${projectKey}/api-keys`)
      .set('Cookie', adminCookie);

    expect(listed.status).toBe(200);
    expect(listed.body.data[0].prefix).toMatch(/^nt_/);
    expect(listed.body.data[0]).not.toHaveProperty('raw');
    expect(listed.body.data[0]).not.toHaveProperty('tokenHash');
  });

  it('rejects key management for a member without PROJECT_SETTINGS_UPDATE', async () => {
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/api-keys`)
      .set('Cookie', developerCookie)
      .send({ name: 'Sneaky' });

    expect(res.status).toBe(403);
  });

  it('a revoked key stops working immediately', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/api-keys`)
      .set('Cookie', adminCookie)
      .send({ name: 'Temp' });

    await request(app.getHttpServer())
      .delete(`/projects/${projectKey}/api-keys/${created.body.data.id}`)
      .set('Cookie', adminCookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', created.body.data.raw)
      .send({ title: 'after revoke' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('API_KEY_INVALID');
  });

  it('the Integration role cannot update an issue', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'read only' });

    const res = await request(app.getHttpServer())
      .patch(`/issues/${created.body.data.id}`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'changed' });

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=api-keys`
Expected: FAIL with 404 on `/api-keys` — the routes do not exist.

- [ ] **Step 3: Add the shared schema**

Create `packages/shared/src/schemas/api-key.schema.ts`:

```typescript
import { z } from 'zod';

export const API_KEY_NAME_MAX = 100;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX),
  expiresAt: z.iso.datetime().optional(),
});

export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;
export type CreateApiKeyParsed = z.infer<typeof createApiKeySchema>;
```

Export it from `packages/shared/src/schemas/index.ts` following the existing re-export style in that file.

- [ ] **Step 4: Add the DTOs**

Create `apps/api/src/modules/api-keys/api-keys.dto.ts`:

```typescript
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';
import { createApiKeySchema } from '@repo/shared/schemas';

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}

export class ApiKeyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() prefix!: string;
  @ApiProperty({ nullable: true, type: String }) expiresAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastUsedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) revokedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class IssuedApiKeyDto extends ApiKeyDto {
  @ApiProperty({ description: 'Shown once at creation and never again.' })
  raw!: string;
}
```

- [ ] **Step 5: Write the controller**

Create `apps/api/src/modules/api-keys/api-keys.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Project } from '@prisma/client';
import { Permission } from '@repo/shared';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ReqProject } from '@/common/decorators/project.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiEnvelope } from '@/common/decorators/api-envelope.decorator';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyRow } from './api-keys.repository';
import { ApiKeyDto, CreateApiKeyDto, IssuedApiKeyDto } from './api-keys.dto';

@Controller('projects/:key/api-keys')
@ProjectAuth()
@RequirePermission(Permission.PROJECT_SETTINGS_UPDATE)
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  @Get()
  @ApiEnvelope(ApiKeyDto, { isArray: true })
  async findAll(@ReqProject() project: Project) {
    const keys = await this.apiKeys.list(project.id);
    return { data: keys.map((key) => this.toDto(key)) };
  }

  @Post()
  @ApiEnvelope(IssuedApiKeyDto, { status: HttpStatus.CREATED })
  async create(
    @ReqProject() project: Project,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser('id') userId: string,
  ) {
    const { key, raw } = await this.apiKeys.issue(
      project.id,
      { name: dto.name, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
      userId,
    );
    return { data: { ...this.toDto(key), raw } };
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@ReqProject() project: Project, @Param('keyId') keyId: string) {
    await this.apiKeys.revoke(project.id, keyId);
  }

  /** Never exposes tokenHash or userId — the secret and the principal stay internal. */
  private toDto(key: ApiKeyRow): ApiKeyDto {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 6: Register the controller**

Add `controllers: [ApiKeysController]` and its import to `apps/api/src/modules/api-keys/api-keys.module.ts` (deferred from Task 5, Step 9).

- [ ] **Step 7: Run the integration tests to verify they pass**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=api-keys`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): project API key management endpoints"
```

---

## Task 10: Keep service principals out of people-facing lists

**Files:**
- Modify: `apps/api/src/modules/projects/projects-members.repository.ts`
- Modify: `apps/api/src/modules/users/users.repository.ts`
- Test: `apps/api/test/api-keys.integration-spec.ts`
- Test: existing repository specs for the touched methods

**Interfaces:**
- Consumes: `UserKind`.
- Produces: no new signatures; the queries gain a `kind: UserKind.HUMAN` predicate.

- [ ] **Step 1: Write the failing integration test**

Add to `apps/api/test/api-keys.integration-spec.ts`:

```typescript
describe('service principals are hidden from people-facing lists', () => {
  it('does not appear in the project members list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${projectKey}/members`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(
      res.body.data.some((m: { email: string }) => m.email.endsWith('@integrations.invalid')),
    ).toBe(false);
  });

  it('is not offered as an assignee', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users?projectKey=${projectKey}`)
      .set('Cookie', adminCookie);

    expect(
      res.body.data.some((u: { email: string }) => u.email.endsWith('@integrations.invalid')),
    ).toBe(false);
  });

  it('still renders as the reporter of the issue it created', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectKey}/issues`)
      .set('X-Api-Key', rawKey)
      .send({ title: 'from the machine' });

    const detail = await request(app.getHttpServer())
      .get(`/projects/${projectKey}/issues/${created.body.data.number}`)
      .set('Cookie', adminCookie);

    expect(detail.body.data.reporter.kind).toBe('SERVICE');
  });
});
```

Before writing the second case, confirm the real query-parameter contract of the user-list endpoint by reading `apps/api/src/modules/users/users.controller.ts`, and adjust the URL to match.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=api-keys -t "people-facing"`
Expected: FAIL — the principal appears in both lists, and `reporter.kind` is undefined.

- [ ] **Step 3: Exclude `SERVICE` from the queries**

In `apps/api/src/modules/projects/projects-members.repository.ts`, add to the `where` clause of the member-listing query:

```typescript
        user: { kind: UserKind.HUMAN },
```

In `apps/api/src/modules/users/users.repository.ts`, add `kind: UserKind.HUMAN` to the `where` of every method that feeds a picker, a mention suggestion, or an invite candidate list. Read the file and decide per method: **lookups by id must not be filtered** — an issue's `SERVICE` reporter still has to resolve for rendering. Only list/search methods get the predicate.

Import `UserKind` from `@prisma/client` in both files.

- [ ] **Step 4: Expose `kind` on the reporter projection**

Add `kind: true` to the reporter/assignee `select` in `apps/api/src/modules/issues/issues.repository.ts`, and add the field to the reporter shape in `UserSummaryDto` (`apps/api/src/modules/issues/issues.dto.ts`) plus the corresponding mapper in `toIssueDetail` so the frontend can render the badge in Task 11.

- [ ] **Step 5: Run the integration tests to verify they pass**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=api-keys`
Expected: PASS.

- [ ] **Step 6: Run the full API gate**

Run: `cd apps/api && pnpm test`
Expected: check-types, lint, unit and integration all pass. Fix any member-list or user-list spec that asserted a count now reduced by the filter.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): hide service principals from member and user pickers"
```

---

## Task 11: Web UI, badge and documentation

**Files:**
- Create: `apps/web/lib/api/api-keys.ts`
- Create: `apps/web/components/api-keys/api-keys-card.tsx`
- Create: `apps/web/components/api-keys/api-key-created-dialog.tsx`
- Create: `apps/web/app/(main)/projects/[key]/settings/api-keys/page.tsx`
- Create: `apps/web/components/shared/service-actor-badge.tsx`
- Test: `apps/web/components/api-keys/api-keys-card.test.tsx`
- Test: `apps/web/components/shared/service-actor-badge.test.tsx`
- Modify: `apps/web/app/(main)/projects/[key]/settings/layout.tsx`
- Modify: `apps/web/components/shared/index.ts`
- Test: `apps/e2e/tests/api-keys.spec.ts`
- Modify: `CLAUDE.md`, `.claude/rules/nestjs-auth-sessions.md`, `.claude/rules/nestjs-module-boundaries.md`

**Interfaces:**
- Consumes: `GET|POST /projects/:key/api-keys`, `DELETE /projects/:key/api-keys/:keyId`; `reporter.kind` on issue detail.
- Produces: `ServiceActorBadge` — a shared component rendering an integration marker.

- [ ] **Step 1: Write the failing badge test**

Create `apps/web/components/shared/service-actor-badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { ServiceActorBadge } from './service-actor-badge';

describe('ServiceActorBadge', () => {
  it('renders a text label, not colour alone', () => {
    render(<ServiceActorBadge />);
    expect(screen.getByText('Integration')).toBeInTheDocument();
  });

  it('is announced to screen readers', () => {
    render(<ServiceActorBadge />);
    expect(screen.getByLabelText('Created by an integration')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm test:unit -- service-actor-badge`
Expected: FAIL — cannot resolve `./service-actor-badge`.

- [ ] **Step 3: Write the badge**

Create `apps/web/components/shared/service-actor-badge.tsx`:

```tsx
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ServiceActorBadge({ className }: { className?: string }) {
  return (
    <span
      aria-label="Created by an integration"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5',
        'text-xs text-muted-foreground',
        className,
      )}
    >
      <Bot aria-hidden className="size-3" />
      Integration
    </span>
  );
}
```

Export it from `apps/web/components/shared/index.ts`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && pnpm test:unit -- service-actor-badge`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing card test**

Create `apps/web/components/api-keys/api-keys-card.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysCard } from './api-keys-card';
import { renderWithProviders, mockApi } from '@/test/utils';

describe('ApiKeysCard', () => {
  it('shows the secret once after creation and only the prefix afterwards', async () => {
    mockApi.post('/projects/DEMO/api-keys', {
      data: { id: 'k1', name: 'MyTracker', prefix: 'nt_abcdefgh', raw: 'nt_abcdefghSECRET' },
    });
    mockApi.get('/projects/DEMO/api-keys', { data: [] });

    renderWithProviders(<ApiKeysCard projectKey="DEMO" />);

    await userEvent.type(screen.getByLabelText('Name'), 'MyTracker');
    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() => {
      expect(screen.getByText('nt_abcdefghSECRET')).toBeInTheDocument();
    });
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();
  });

  it('renders the empty state when the project has no keys', async () => {
    mockApi.get('/projects/DEMO/api-keys', { data: [] });
    renderWithProviders(<ApiKeysCard projectKey="DEMO" />);
    await waitFor(() => {
      expect(screen.getByText(/no api keys/i)).toBeInTheDocument();
    });
  });
});
```

The `renderWithProviders` / `mockApi` names above are the shape this test needs, not necessarily the names this repo uses. Locate the real helpers first — `grep -rn "renderWithProviders\|msw\|setupServer" apps/web --include='*.tsx' --include='*.ts' | head -5` — and substitute the actual exports and request-mocking mechanism before running the test.

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web && pnpm test:unit -- api-keys-card`
Expected: FAIL — cannot resolve `./api-keys-card`.

- [ ] **Step 7: Write the client, dialog and card**

Create `apps/web/lib/api/api-keys.ts` with `listApiKeys`, `createApiKey`, `revokeApiKey` and a `apiKeyKeys` query-key factory, following the shape of an existing client module (read `apps/web/lib/api/webhooks.ts` for the house pattern, including how mutations declare `meta.invalidates`).

Create `apps/web/components/api-keys/api-key-created-dialog.tsx` — a dialog receiving the raw key, showing it in a monospace block with a copy button and the text "This key won't be shown again." Use the existing `Dialog` from `components/ui` and remember base-ui uses `render`, not `asChild`.

Create `apps/web/components/api-keys/api-keys-card.tsx` — a `Card` (note the base `flex flex-col gap-4 py-4`; add `flex-row` only if a horizontal layout is wanted) containing the create form, the key list wrapped in `AsyncContent` for its loading/empty/content states, `RelativeTime` for `lastUsedAt`, and `ConfirmDialog` for revoke. Never `window.confirm`.

Create `apps/web/app/(main)/projects/[key]/settings/api-keys/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ApiKeysCard } from '@/components/api-keys/api-keys-card';

export default function ApiKeysSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Let external systems create issues in this project over HTTP."
      />
      <div className="mt-6">
        <ApiKeysCard projectKey={key} />
      </div>
    </div>
  );
}
```

Add the nav entry to `apps/web/app/(main)/projects/[key]/settings/layout.tsx`, after the `Integrations` entry:

```tsx
  { label: 'API Keys', href: '/api-keys', icon: KeyRound },
```

Import `KeyRound` from `lucide-react`.

- [ ] **Step 8: Render the badge next to service actors**

Find the components that render an issue reporter and activity actor (`grep -rln "reporter" apps/web/components | head`) and render `<ServiceActorBadge />` beside the name when `kind === 'SERVICE'`.

- [ ] **Step 9: Run the web unit suite and typecheck**

Run: `cd apps/web && pnpm test:unit`
Expected: PASS.

Run: `cd apps/web && pnpm check-types`
Expected: no errors.

- [ ] **Step 10: Write the e2e test**

Create `apps/e2e/tests/api-keys.spec.ts`, following the page-object conventions of the existing suite (read `apps/e2e/tests` and the `playwright-e2e` skill first):

```typescript
test('issues a key, shows the secret once, then revokes it', async ({ page }) => {
  await page.goto(`/projects/${projectKey}/settings/api-keys`);

  await page.getByLabel('Name').fill('E2E tracker');
  await page.getByRole('button', { name: /create key/i }).click();

  const secret = page.getByTestId('api-key-secret');
  await expect(secret).toContainText(/^nt_/);
  const raw = await secret.innerText();

  await page.getByRole('button', { name: /done/i }).click();
  await page.reload();

  await expect(page.getByText(raw)).toHaveCount(0);
  await expect(page.getByText('E2E tracker')).toBeVisible();

  await page.getByRole('button', { name: /revoke/i }).click();
  await page.getByRole('button', { name: /confirm/i }).click();
  await expect(page.getByText(/revoked/i)).toBeVisible();
});
```

- [ ] **Step 11: Run e2e**

Run: `pnpm test:e2e --filter e2e -- api-keys`
Expected: PASS. Do not run this while API integration tests are running — they share one Postgres.

- [ ] **Step 12: Update the documentation**

In `CLAUDE.md`, under **Architectural Hard Constraints**, add:

```markdown
- Machine callers authenticate with a project API key in the `X-Api-Key` header, which resolves to a `User` with `kind: SERVICE` holding the `Integration` role in that project. There is no separate machine authorization model — `PermissionGuard` applies unchanged. Issue creation accepts an opaque caller-supplied `dedupKey`; a repeat returns `200` with `meta.deduplicated` and the existing issue.
```

In `CLAUDE.md`, under **Gotchas**, add:

```markdown
- The `issues_project_dedup_key_unique` index is a **partial** unique index created by raw SQL in a migration. `prisma db push` skips it, so the integration harness (`test/support/global-setup.ts`) creates it explicitly after pushing the schema. If that step is dropped, the dedup race test passes without testing anything.
```

In `.claude/rules/nestjs-auth-sessions.md`, add a section documenting the `X-Api-Key` path: single `API_KEY_INVALID` code for every failure mode, `SERVICE` principals cannot log in with a password, and `lastUsedAt` is written through `BackgroundTasks` at most once per minute.

In `.claude/rules/nestjs-module-boundaries.md`, add `api-keys` to the cross-module writers of `UsersRepository` (it creates service principals) and of `ProjectMembersRepository` (it manages the principal's membership).

- [ ] **Step 13: Run both full gates**

Run: `cd apps/api && pnpm test`
Run: `cd apps/web && pnpm test`
Expected: both pass.

- [ ] **Step 14: Commit**

```bash
git add apps/web apps/e2e CLAUDE.md .claude/rules
git commit -m "feat(web): API key management UI, integration badge and docs"
```

---

## Task 12: Resolve the spec's open questions

The spec lists assumptions that were never checked against a running system. Two remain after the deviations above resolved the third.

**Files:**
- Modify: `apps/api/src/modules/search/indexer/issue-indexer.service.ts` (only if the check below finds a problem)
- Modify: `docs/superpowers/specs/2026-08-21-integration-api-design.md`

- [ ] **Step 1: Check whether `dedupKey` leaks into the search index**

```bash
grep -n "select\|include" apps/api/src/modules/search/indexer/issue-indexer.service.ts | head -20
```

If the indexer reads the issue model wholesale rather than with an explicit `select`, `dedupKey` now enters the Elasticsearch document for no benefit. In that case add an explicit `select` listing only the fields the document actually uses.

- [ ] **Step 2: Verify the OpenAPI document still builds**

`@Res({ passthrough: true })` on the issue-create handler can confuse response-schema generation.

```bash
cd apps/api && SWAGGER_ENABLED=true pnpm start:dev
```

Fetch `http://localhost:3001/docs-json` and confirm the `POST /projects/{key}/issues` entry still documents `IssueDetailDto` for its 201 response. Stop the server afterwards. If the schema is lost, add an explicit `@ApiResponse` for both the 200 and 201 cases.

- [ ] **Step 3: Record the outcomes in the spec**

Replace section 10 of `docs/superpowers/specs/2026-08-21-integration-api-design.md` with the findings — for each item, what was checked, what the answer was, and what changed as a result. An unresolved item stays listed with the reason.

- [ ] **Step 4: Commit**

```bash
git add apps/api docs/superpowers/specs
git commit -m "docs: resolve integration API open questions"
```

---

## Verification

Full gate before declaring the feature done:

```bash
cd apps/api && pnpm test        # check-types → lint → unit → integration
cd apps/web && pnpm test       # check-types → lint → unit → build → e2e
```

Manual smoke test against a running stack, using a key issued through the settings page:

```bash
curl -sS -X POST http://localhost:3001/api/projects/DEMO/issues \
  -H "X-Api-Key: $NT_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"TypeError: cannot read property id of null","dedupKey":"group-abc123"}'
```

Run it twice. The first call answers `201`; the second answers `200` with `meta.deduplicated` and the same issue id.
