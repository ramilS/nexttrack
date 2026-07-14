# YouTrack Migration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace counter-based local resume with a target-side source-aware
migration manifest that makes every later entity loader idempotent, resumable,
and verifiable.

**Architecture:** NextTrack stores `MigrationRun` and `MigrationEntity` records.
The migrator computes a stable checksum for each canonical entity, registers it
as discovered, and advances it through validated states. A run cannot complete
while any entity is failed or unverified. The existing JSON checkpoint remains
only as a short-lived compatibility carrier for `runId` and the ID map during
this workstream; later workstreams remove the ID map as entity source mappings
move into the manifest.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Zod/nestjs-zod, Jest integration
tests, TypeScript 5.9, Axios, Vitest, Node `crypto`, pnpm.

## Global Constraints

- Use `pnpm`, never npm or yarn.
- Keep `apps/api/prisma.config.ts` excluded from `nest build`.
- Use Prisma enum constants in TypeScript; string values are permitted only in
  SQL migrations and Zod enum serialization.
- Every migration endpoint remains behind `JwtAuthGuard` and `MigrationGuard`.
- Every request body is validated through a `createZodDto` class.
- Services throw project `DomainError` subclasses, not Nest HTTP exceptions.
- Do not return access tokens or secrets in migration run configuration.
- Never store `sourceToken`, `targetToken`, or `migrationSecret` in the manifest
  or checkpoint.
- A run reaches `COMPLETED` only when every entity is `VERIFIED` or
  `EXCLUDED_APPROVED`.
- Preserve unrelated user changes in the worktree.
- Follow TDD: observe every new test fail before implementation and pass after.
- After Prisma changes, run the query-performance self-check and relevant API
  integration suite.

---

### Task 1: Add persistent migration run and entity manifest models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260714000000_migration_manifest/migration.sql`
- Test: `apps/api/test/migration-manifest.integration-spec.ts`

**Interfaces:**
- Produces: Prisma models `MigrationRun`, `MigrationEntity` and enums
  `MigrationRunStatus`, `MigrationEntityStatus`.
- Consumes: existing Prisma configuration and integration-test database reset.

- [ ] **Step 1: Add a failing integration test for manifest constraints**

Create `apps/api/test/migration-manifest.integration-spec.ts` with the standard
`createE2eApp`/`truncateTables` harness and this database-level test:

```typescript
import { E2eContext, createE2eApp, teardownE2eApp, truncateTables } from './support/create-e2e-app';

describe('Migration manifest (Integration)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => teardownE2eApp(ctx));
  beforeEach(async () => truncateTables(ctx.prisma));

  it('uniquely identifies a source entity inside a run', async () => {
    const run = await ctx.prisma.migrationRun.create({
      data: {
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: {},
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
      },
    });

    const data = {
      runId: run.id,
      entityType: 'issue',
      sourceId: '2-42',
      sourceChecksum: 'b'.repeat(64),
    };
    await ctx.prisma.migrationEntity.create({ data });
    await expect(ctx.prisma.migrationEntity.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});
```

- [ ] **Step 2: Run the new test and confirm the red state**

Run:

```bash
cd apps/api && pnpm test:integration -- --runInBand --testPathPatterns=migration-manifest
```

Expected: TypeScript/Prisma client failure because `migrationRun` and
`migrationEntity` do not exist.

- [ ] **Step 3: Add the Prisma schema**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model MigrationRun {
  id               String             @id @default(uuid())
  sourceSystem     String             @map("source_system") @db.VarChar(50)
  sourceTenant     String             @map("source_tenant") @db.VarChar(255)
  sourceUrl        String             @map("source_url") @db.VarChar(2048)
  targetUrl        String             @map("target_url") @db.VarChar(2048)
  config           Json
  configHash       String             @map("config_hash") @db.VarChar(64)
  specVersion      String             @map("spec_version") @db.VarChar(50)
  exclusionVersion String             @map("exclusion_version") @db.VarChar(50)
  status           MigrationRunStatus @default(RUNNING)
  startedAt        DateTime           @default(now()) @map("started_at") @db.Timestamptz(3)
  completedAt      DateTime?          @map("completed_at") @db.Timestamptz(3)
  createdAt        DateTime           @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime           @updatedAt @map("updated_at") @db.Timestamptz(3)

  entities MigrationEntity[]

  @@index([sourceSystem, sourceTenant, status])
  @@index([status, updatedAt])
  @@map("migration_runs")
}

model MigrationEntity {
  id                String                @id @default(uuid())
  runId             String                @map("run_id")
  entityType        String                @map("entity_type") @db.VarChar(100)
  sourceId          String                @map("source_id") @db.VarChar(500)
  sourceChecksum    String                @map("source_checksum") @db.VarChar(64)
  targetId          String?               @map("target_id")
  status            MigrationEntityStatus @default(DISCOVERED)
  attemptCount      Int                   @default(0) @map("attempt_count")
  errorCode         String?               @map("error_code") @db.VarChar(100)
  errorMessage      String?               @map("error_message") @db.Text
  errorDetails      Json?                 @map("error_details")
  discoveredAt      DateTime              @default(now()) @map("discovered_at") @db.Timestamptz(3)
  transformedAt     DateTime?             @map("transformed_at") @db.Timestamptz(3)
  loadedAt          DateTime?             @map("loaded_at") @db.Timestamptz(3)
  verifiedAt        DateTime?             @map("verified_at") @db.Timestamptz(3)
  createdAt         DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)

  run MigrationRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, entityType, sourceId])
  @@index([runId, status, entityType])
  @@index([runId, targetId])
  @@map("migration_entities")
}

enum MigrationRunStatus {
  RUNNING
  FAILED
  COMPLETED

  @@map("migration_run_status")
}

enum MigrationEntityStatus {
  DISCOVERED
  TRANSFORMED
  LOADED
  VERIFIED
  FAILED
  EXCLUDED_APPROVED

  @@map("migration_entity_status")
}
```

- [ ] **Step 4: Generate and inspect the SQL migration**

Run:

```bash
cd apps/api && pnpm prisma migrate dev --name migration_manifest
pnpm prisma generate
```

Expected: a migration containing two enum types, two tables, the unique
constraint, foreign key with cascade delete, and the four declared indexes.
Do not hand-edit generated SQL unless Prisma fails to express the schema.

- [ ] **Step 5: Run the integration test**

Run:

```bash
cd apps/api && pnpm test:integration -- --runInBand --testPathPatterns=migration-manifest
```

Expected: PASS.

- [ ] **Step 6: Run the Prisma query self-check**

Confirm the manifest access patterns are covered:

- discovery uses the composite unique key;
- work queues use `(run_id, status, entity_type)`;
- target reconciliation uses `(run_id, target_id)`;
- no query requires an unbounded `findMany`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/migration-manifest.integration-spec.ts
git commit -m "feat(migration): add persistent migration manifest"
```

### Task 2: Implement manifest repository and validated state transitions

**Files:**
- Create: `apps/api/src/modules/migration/migration-manifest.repository.ts`
- Create: `apps/api/src/modules/migration/migration-manifest.service.ts`
- Create: `apps/api/src/modules/migration/migration-manifest.service.spec.ts`
- Modify: `apps/api/src/modules/migration/migration.module.ts`
- Modify: `packages/shared/src/error-codes.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1.
- Produces:
  - `MigrationManifestService.startRun(input): Promise<MigrationRun>`
  - `MigrationManifestService.getRun(runId): Promise<MigrationRunSummary>`
  - `MigrationManifestService.discover(runId, inputs): Promise<MigrationEntity[]>`
  - `MigrationManifestService.transition(runId, input): Promise<MigrationEntity>`
  - `MigrationManifestService.complete(runId): Promise<MigrationRunSummary>`

- [ ] **Step 1: Write transition unit tests**

Create a service spec with a mocked repository and cover these exact cases:

```typescript
it.each([
  ['DISCOVERED', 'TRANSFORMED'],
  ['TRANSFORMED', 'LOADED'],
  ['LOADED', 'VERIFIED'],
  ['DISCOVERED', 'FAILED'],
  ['TRANSFORMED', 'FAILED'],
  ['LOADED', 'FAILED'],
  ['FAILED', 'TRANSFORMED'],
  ['DISCOVERED', 'EXCLUDED_APPROVED'],
])('allows %s -> %s', async (from, to) => {
  repo.findEntity.mockResolvedValue(entity({ status: from }));
  repo.updateEntity.mockResolvedValue(entity({ status: to }));
  await expect(service.transition(RUN_ID, transition({ status: to }))).resolves.toMatchObject({ status: to });
});

it('rejects VERIFIED -> LOADED', async () => {
  repo.findEntity.mockResolvedValue(entity({ status: 'VERIFIED' }));
  await expect(service.transition(RUN_ID, transition({ status: 'LOADED' })))
    .rejects.toMatchObject({ code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION });
});

it('does not complete a run with nonterminal entities', async () => {
  repo.countNonterminal.mockResolvedValue(1);
  await expect(service.complete(RUN_ID))
    .rejects.toMatchObject({ code: ErrorCode.MIGRATION_RUN_INCOMPLETE });
});
```

Use typed fixture builders returning Prisma enum constants, not `as any`.

- [ ] **Step 2: Run the service spec and confirm failure**

```bash
cd apps/api && pnpm test:unit -- --runInBand migration-manifest.service.spec.ts
```

Expected: FAIL because the service/repository and error codes do not exist.

- [ ] **Step 3: Add error codes**

Add to `packages/shared/src/error-codes.ts` beside existing migration errors:

```typescript
MIGRATION_RUN_NOT_FOUND: 'MIGRATION_RUN_NOT_FOUND',
MIGRATION_ENTITY_NOT_FOUND: 'MIGRATION_ENTITY_NOT_FOUND',
MIGRATION_INVALID_STATE_TRANSITION: 'MIGRATION_INVALID_STATE_TRANSITION',
MIGRATION_CHECKSUM_MISMATCH: 'MIGRATION_CHECKSUM_MISMATCH',
MIGRATION_RUN_INCOMPLETE: 'MIGRATION_RUN_INCOMPLETE',
MIGRATION_RESUME_CONFIG_MISMATCH: 'MIGRATION_RESUME_CONFIG_MISMATCH',
```

- [ ] **Step 4: Implement the repository**

Implement focused methods using composite keys and bounded pages:

```typescript
const PAGE_LIMIT_MAX = 500;

async findRun(id: string) {
  return this.prisma.migrationRun.findUnique({ where: { id } });
}

async findEntity(runId: string, entityType: string, sourceId: string) {
  return this.prisma.migrationEntity.findUnique({
    where: { runId_entityType_sourceId: { runId, entityType, sourceId } },
  });
}

async discoverMany(runId: string, inputs: DiscoverEntityInput[]) {
  await this.prisma.migrationEntity.createMany({
    data: inputs.map((input) => ({ runId, ...input })),
    skipDuplicates: true,
  });
  return this.prisma.migrationEntity.findMany({
    where: {
      runId,
      OR: inputs.map(({ entityType, sourceId }) => ({ entityType, sourceId })),
    },
    take: Math.min(inputs.length, PAGE_LIMIT_MAX),
  });
}

async countNonterminal(runId: string) {
  return this.prisma.migrationEntity.count({
    where: {
      runId,
      status: { notIn: [MigrationEntityStatus.VERIFIED, MigrationEntityStatus.EXCLUDED_APPROVED] },
    },
  });
}
```

Reject discovery batches above 500 in the service so the `OR` query is bounded.
Add repository methods `createRun`, `updateEntity`, `updateRunStatus`, and a
bounded `listEntities` using cursor pagination.

- [ ] **Step 5: Implement state validation in the service**

Define the transition map exactly:

```typescript
const ALLOWED: Readonly<Record<MigrationEntityStatus, readonly MigrationEntityStatus[]>> = {
  [MigrationEntityStatus.DISCOVERED]: [
    MigrationEntityStatus.TRANSFORMED,
    MigrationEntityStatus.FAILED,
    MigrationEntityStatus.EXCLUDED_APPROVED,
  ],
  [MigrationEntityStatus.TRANSFORMED]: [MigrationEntityStatus.LOADED, MigrationEntityStatus.FAILED],
  [MigrationEntityStatus.LOADED]: [MigrationEntityStatus.VERIFIED, MigrationEntityStatus.FAILED],
  [MigrationEntityStatus.VERIFIED]: [MigrationEntityStatus.DISCOVERED],
  [MigrationEntityStatus.FAILED]: [MigrationEntityStatus.TRANSFORMED, MigrationEntityStatus.EXCLUDED_APPROVED],
  [MigrationEntityStatus.EXCLUDED_APPROVED]: [MigrationEntityStatus.DISCOVERED],
};
```

When discovery finds the same checksum, retain the current state. When it finds
a changed checksum, update the checksum, clear target/error/timestamps that no
longer apply, and reopen the entity as `DISCOVERED`. Increment `attemptCount`
when entering `TRANSFORMED`. Require `targetId` for `LOADED` and `VERIFIED`.
Require structured `errorCode` and `errorMessage` for `FAILED`.

- [ ] **Step 6: Register providers**

Add `MigrationManifestRepository` and `MigrationManifestService` to
`MigrationModule.providers`. Do not inject them into the existing
`MigrationService` yet.

- [ ] **Step 7: Run unit tests and typecheck**

```bash
cd apps/api && pnpm test:unit -- --runInBand migration-manifest.service.spec.ts
pnpm check-types
```

Expected: PASS with no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/error-codes.ts apps/api/src/modules/migration
git commit -m "feat(migration): add manifest state service"
```

### Task 3: Expose run and manifest endpoints

**Files:**
- Create: `apps/api/src/modules/migration/dto/migration-manifest.dto.ts`
- Modify: `apps/api/src/modules/migration/migration.dto.ts`
- Modify: `apps/api/src/modules/migration/dto/migration-responses.ts`
- Modify: `apps/api/src/modules/migration/migration.controller.ts`
- Test: `apps/api/test/migration-manifest.integration-spec.ts`

**Interfaces:**
- Consumes: `MigrationManifestService` from Task 2.
- Produces:
  - `POST /api/admin/migration/runs`
  - `GET /api/admin/migration/runs/:runId`
  - `POST /api/admin/migration/runs/:runId/entities/discover`
  - `PATCH /api/admin/migration/runs/:runId/entities/state`
  - `GET /api/admin/migration/runs/:runId/entities`
  - `POST /api/admin/migration/runs/:runId/complete`

- [ ] **Step 1: Add failing authenticated endpoint tests**

Extend the integration spec using the admin login and migration-secret setup
from `migration-counter.integration-spec.ts`:

```typescript
import type { Test } from 'supertest';

function migrationRequest<T extends Test>(test: T): T {
  return test
    .set('Authorization', `Bearer ${adminToken}`)
    .set('x-migration-secret', MIGRATION_SECRET) as T;
}
```

```typescript
const start = await migrationRequest(request(ctx.app.getHttpServer()).post('/admin/migration/runs'))
  .send({
    sourceSystem: 'youtrack-cloud',
    sourceTenant: 'example.youtrack.cloud',
    sourceUrl: 'https://example.youtrack.cloud',
    targetUrl: 'http://localhost:3001',
    config: { projects: ['APP'] },
    configHash: 'a'.repeat(64),
    specVersion: '2026-07-14',
    exclusionVersion: '2026-07-14',
  })
  .expect(201);
const runId = start.body.data.data.id;

await migrationRequest(request(ctx.app.getHttpServer())
  .post(`/admin/migration/runs/${runId}/entities/discover`))
  .send({ entities: [{ entityType: 'issue', sourceId: '2-42', sourceChecksum: 'b'.repeat(64) }] })
  .expect(201);

await migrationRequest(request(ctx.app.getHttpServer())
  .post(`/admin/migration/runs/${runId}/complete`))
  .expect(400)
  .expect(({ body }) => expect(body.error.code).toBe(ErrorCode.MIGRATION_RUN_INCOMPLETE));
```

Also assert missing admin JWT returns 401 and missing migration secret returns
403 for `POST /runs`.

- [ ] **Step 2: Run and observe 404 failures**

```bash
cd apps/api && pnpm test:integration -- --runInBand --testPathPatterns=migration-manifest
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Define Zod schemas**

In `dto/migration-manifest.dto.ts`, export schemas and inferred types:

```typescript
export const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const startMigrationRunSchema = z.object({
  sourceSystem: z.literal('youtrack-cloud'),
  sourceTenant: z.string().trim().min(1).max(255),
  sourceUrl: z.url(),
  targetUrl: z.url(),
  config: z.record(z.string(), z.unknown()),
  configHash: checksumSchema,
  specVersion: z.literal('2026-07-14'),
  exclusionVersion: z.literal('2026-07-14'),
});
export const discoverMigrationEntitiesSchema = z.object({
  entities: z.array(z.object({
    entityType: z.string().trim().min(1).max(100),
    sourceId: z.string().trim().min(1).max(500),
    sourceChecksum: checksumSchema,
  })).min(1).max(500),
});
export const transitionMigrationEntitySchema = z.object({
  entityType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(500),
  sourceChecksum: checksumSchema,
  status: z.enum(MigrationEntityStatus),
  targetId: z.string().trim().min(1).max(500).optional(),
  error: z.object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(10_000),
    details: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});
export const listMigrationEntitiesQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(100).optional(),
  status: z.enum(MigrationEntityStatus).optional(),
  cursor: z.guid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
```

Wrap each request schema with `createZodDto` in `migration.dto.ts`. Add response
schemas that expose ISO date strings and never include secrets.

- [ ] **Step 4: Add controller methods**

Inject `MigrationManifestService` beside the existing service and add the six
routes. Keep them inside the already guarded controller. Use `@ApiEnvelope` for
every response and `@Query()` with the Zod DTO for list filters.

- [ ] **Step 5: Run integration and unit gates**

```bash
cd apps/api && pnpm test:integration -- --runInBand --testPathPatterns=migration-manifest
pnpm test:unit -- --runInBand migration-manifest.service.spec.ts
pnpm check-types
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/migration apps/api/test/migration-manifest.integration-spec.ts
git commit -m "feat(migration): expose manifest run API"
```

### Task 4: Add canonical source identity and stable checksums to the migrator

**Files:**
- Create: `packages/migrator/src/manifest/manifest.types.ts`
- Create: `packages/migrator/src/manifest/stable-checksum.ts`
- Create: `packages/migrator/src/manifest/stable-checksum.spec.ts`

**Interfaces:**
- Produces:
  - `CanonicalEntity<T>`
  - `stableJson(value: unknown): string`
  - `sourceChecksum(value: unknown): string`
- Consumes: Node `crypto`; no new dependency.

- [ ] **Step 1: Write checksum tests**

```typescript
import { describe, expect, it } from 'vitest';
import { sourceChecksum, stableJson } from './stable-checksum';

describe('stable checksum', () => {
  it('sorts object keys recursively but preserves array order', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}');
  });

  it('produces the same checksum for equivalent object insertion order', () => {
    expect(sourceChecksum({ a: 1, b: 2 })).toBe(sourceChecksum({ b: 2, a: 1 }));
  });

  it('changes when relationship order changes', () => {
    expect(sourceChecksum({ ids: ['a', 'b'] })).not.toBe(sourceChecksum({ ids: ['b', 'a'] }));
  });
});
```

- [ ] **Step 2: Run the test and observe import failure**

```bash
cd packages/migrator && pnpm test:unit -- stable-checksum.spec.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement stable serialization and hash**

```typescript
import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sourceChecksum(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
```

In `manifest.types.ts` define:

```typescript
export interface SourceIdentity {
  sourceSystem: 'youtrack-cloud';
  entityType: string;
  sourceId: string;
}

export interface CanonicalEntity<T> extends SourceIdentity {
  checksum: string;
  payload: T;
}

export function canonicalEntity<T>(
  identity: SourceIdentity,
  payload: T,
): CanonicalEntity<T> {
  return { ...identity, payload, checksum: sourceChecksum(payload) };
}
```

Import `sourceChecksum` explicitly in `manifest.types.ts`.

- [ ] **Step 4: Run migrator tests**

```bash
cd packages/migrator && pnpm test
```

Expected: typecheck and all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src/manifest
git commit -m "feat(migrator): add canonical source checksums"
```

### Task 5: Add manifest API client and retry classification

**Files:**
- Modify: `packages/migrator/src/loaders/api-client.ts`
- Modify: `packages/migrator/src/loaders/api-client.spec.ts`
- Modify: `packages/migrator/src/utils/retry.ts`
- Create: `packages/migrator/src/utils/retry.spec.ts`
- Create: `packages/migrator/src/utils/error-classification.ts`
- Create: `packages/migrator/src/utils/error-classification.spec.ts`

**Interfaces:**
- Consumes: endpoints from Task 3.
- Produces:
  - `OurApiClient.startMigrationRun`
  - `OurApiClient.getMigrationRun`
  - `OurApiClient.discoverEntities`
  - `OurApiClient.transitionEntity`
  - `OurApiClient.listEntities`
  - `OurApiClient.completeMigrationRun`
  - retry option `shouldRetry(error, attempt): boolean`
  - `classifyMigrationError(error): 'FATAL' | 'TRANSIENT' | 'PERMANENT'`

- [ ] **Step 1: Add failing error-classification tests**

Cover exact HTTP behavior:

```typescript
it.each([401, 403])('classifies %s as fatal', (status) => {
  expect(classifyMigrationError(axiosError(status))).toBe('FATAL');
});
it.each([408, 429, 500, 502, 503, 504])('classifies %s as transient', (status) => {
  expect(classifyMigrationError(axiosError(status))).toBe('TRANSIENT');
});
it.each([400, 404, 409, 422])('classifies %s as permanent', (status) => {
  expect(classifyMigrationError(axiosError(status))).toBe('PERMANENT');
});
it('classifies a timeout without a response as transient', () => {
  expect(classifyMigrationError(axiosError(undefined, 'ECONNABORTED'))).toBe('TRANSIENT');
});
```

- [ ] **Step 2: Extend retry with a predicate and test it**

Change the interface to:

```typescript
export interface RetryOptions {
  attempts: number;
  delay: number;
  backoff: number;
  jitter?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}
```

Before sleeping, throw immediately when `shouldRetry?.(err, attempt) === false`.
Apply symmetric random jitter in `[1-jitter, 1+jitter]`, with default `0` to
keep existing tests deterministic. Add fake-timer tests proving permanent
errors call the function once and transient errors call it three times.

- [ ] **Step 3: Implement classification**

Use `axios.isAxiosError`. Treat 401/403 as fatal, missing-response network
errors and 408/429/5xx as transient, and remaining 4xx as permanent. Treat
non-Axios errors as permanent unless their Node error code is one of
`ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EAI_AGAIN`.

- [ ] **Step 4: Add API-client methods and mocked-Axios tests**

Refactor `OurApiClient` constructor to accept an optional `AxiosInstance` only
for tests, defaulting to the current configured instance. Add typed methods for
all six endpoints. Each method unwraps the global envelope and calls `retry`
with:

```typescript
{
  attempts: 4,
  delay: 500,
  backoff: 2,
  jitter: 0.2,
  shouldRetry: (error) => classifyMigrationError(error) === 'TRANSIENT',
}
```

Tests must assert the exact URL, body, query parameters, and unwrapped response.
Do not include credentials in request bodies.

- [ ] **Step 5: Run migrator tests**

```bash
cd packages/migrator && pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/migrator/src/loaders packages/migrator/src/utils
git commit -m "feat(migrator): add manifest client and safe retries"
```

### Task 6: Create and resume migration runs with immutable configuration

**Files:**
- Create: `packages/migrator/src/manifest/run-config.ts`
- Create: `packages/migrator/src/manifest/run-config.spec.ts`
- Create: `packages/migrator/src/manifest/migration-run.coordinator.ts`
- Create: `packages/migrator/src/manifest/migration-run.coordinator.spec.ts`
- Modify: `packages/migrator/src/checkpoint/checkpoint.types.ts`
- Modify: `packages/migrator/src/commands/migrate.command.ts`

**Interfaces:**
- Consumes: manifest client from Task 5 and `MigrateOptions`.
- Produces:
  - `buildRunConfig(options): SafeMigrationRunConfig`
  - `MigrationRunCoordinator.open(options, checkpoint): Promise<{ runId: string; configHash: string }>`
- Checkpoint version `0.2.0` carries `runId` and `configHash` but no credentials.

- [ ] **Step 1: Write safe-config tests**

Assert normalization and secret omission:

```typescript
const result = buildRunConfig(options({
  sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
  targetUrl: 'http://localhost:3001/',
  projects: ['ops', 'APP', 'app'],
  sourceToken: 'source-secret',
  targetToken: 'target-secret',
  migrationSecret: 'migration-secret',
}));

expect(result).toMatchObject({
  sourceUrl: 'https://example.youtrack.cloud',
  targetUrl: 'http://localhost:3001',
  projects: ['APP', 'OPS'],
});
expect(JSON.stringify(result)).not.toContain('secret');
```

Include every behavior-affecting option: project selection, all-projects,
attachments, time tracking, boards, closed issues, estimate field, batch size,
rate limit, and concurrency. Exclude verbose, resume, checkpoint path, and all
credentials.

- [ ] **Step 2: Write coordinator tests**

Test that a new run calls `startMigrationRun`; resume calls `getMigrationRun`;
same config succeeds; changed projects or feature flags throw a local
`MIGRATION_RESUME_CONFIG_MISMATCH` before extraction starts.

- [ ] **Step 3: Run focused tests and observe failures**

```bash
cd packages/migrator && pnpm test:unit -- run-config.spec.ts migration-run.coordinator.spec.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement safe config and coordinator**

Compute `configHash` with `sourceChecksum(buildRunConfig(options))`. Use
`new URL(url)` to lower-case hosts and remove only the trailing slash. Derive
`sourceTenant` from the normalized hostname. Pin `specVersion` and
`exclusionVersion` to `2026-07-14` constants exported from `run-config.ts`.

On resume compare the server run's source system, tenant, URLs, config hash,
spec version, and exclusion version. Produce a message listing the mismatched
field names without printing secrets.

- [ ] **Step 5: Extend checkpoint compatibility**

Add required fields to new checkpoints:

```typescript
runId: string;
configHash: string;
```

Set `VERSION = '0.2.0'`. Reject `--resume` from a pre-0.2 checkpoint with a
clear instruction to start a new manifest-backed run; do not guess or backfill
its semantics.

- [ ] **Step 6: Wire coordinator before phase execution**

In `MigrateCommand.run`, resolve `--all-projects` first so the normalized project
set is part of the immutable config. Open/create the run before users migration,
persist `runId/configHash` immediately, and print the run ID. Do not yet rewrite
individual phases; Task 7 adds the entity executor.

- [ ] **Step 7: Run migrator gate**

```bash
cd packages/migrator && pnpm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/migrator/src/manifest packages/migrator/src/checkpoint packages/migrator/src/commands/migrate.command.ts
git commit -m "feat(migrator): validate manifest-backed resume config"
```

### Task 7: Add the reusable manifest entity executor and completion gate

**Files:**
- Create: `packages/migrator/src/manifest/entity-executor.ts`
- Create: `packages/migrator/src/manifest/entity-executor.spec.ts`
- Modify: `packages/migrator/src/commands/migrate.command.ts`
- Modify: `packages/migrator/src/reporters/summary.reporter.ts`

**Interfaces:**
- Consumes: `CanonicalEntity<T>`, `OurApiClient`, `MigrationRunCoordinator`, and
  error classification.
- Produces:
  - `ManifestEntityExecutor.execute<T>(entity, handlers): Promise<ExecutionResult>`
  - run completion blocked on any failed/unverified manifest row.
- Establishes the executor interface consumed by every later workstream.

- [ ] **Step 1: Write executor behavior tests**

Cover:

1. new entity: discover -> transform -> load -> verify;
2. same checksum already verified: no transform/load/verify callbacks;
3. changed checksum: server discovery reopens it and callbacks run;
4. transient load error is retried by the loader and final success verifies;
5. permanent entity error transitions to `FAILED` and returns a failed result;
6. fatal auth error is rethrown and does not continue to later entities;
7. verifier mismatch transitions to `FAILED` with code
   `MIGRATION_VERIFICATION_MISMATCH`.

Use callbacks with explicit interfaces:

```typescript
export interface EntityHandlers<TPayload, TTransformed> {
  transform: (payload: TPayload) => Promise<TTransformed> | TTransformed;
  load: (value: TTransformed) => Promise<{ targetId: string }>;
  verify: (targetId: string, value: TTransformed) => Promise<void>;
}
```

- [ ] **Step 2: Run focused test and observe failure**

```bash
cd packages/migrator && pnpm test:unit -- entity-executor.spec.ts
```

Expected: FAIL because the executor does not exist.

- [ ] **Step 3: Implement the executor**

The executor registers discovery first, reads the returned entity state, and
skips only `VERIFIED`/same-checksum rows. It transitions before and after each
callback. On a permanent error it writes a structured failed transition using
`formatHttpError`; on fatal error it rethrows after best-effort run failure
reporting. It never marks an entity verified merely because loading returned.

Return:

```typescript
export type ExecutionResult =
  | { status: 'VERIFIED'; targetId: string; skipped: boolean }
  | { status: 'FAILED'; error: string };
```

- [ ] **Step 4: Integrate one pilot phase: users**

Wrap the user phase with canonical payloads and the executor. The user verifier
calls `findUserByEmail` and compares source `ytId`, normalized email, name,
blocked state, and target ID. Preserve the existing user transformer. Remove
the user phase's unconditional `COMPLETED` behavior; the manifest is the source
of completion truth.

This pilot proves the interface before later plans convert the remaining
domains.

- [ ] **Step 5: Add run completion gate**

At command end call `completeMigrationRun(runId)`. If the API returns
`MIGRATION_RUN_INCOMPLETE`, print manifest summary counts and exit nonzero. Do
not queue search reindex in this workstream unless the current project phases
have no recorded failures; later verification workstream moves reindex behind
full semantic verification.

- [ ] **Step 6: Update summary output**

Print run ID and counts by manifest status. Stop describing processed counters
as migrated counts. Keep the legacy checkpoint summary labeled `legacy` until
later plans remove it.

- [ ] **Step 7: Run all foundation gates**

```bash
cd packages/migrator && pnpm test
cd ../../apps/api && pnpm test:unit
pnpm test:integration -- --runInBand --testPathPatterns=migration-manifest
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): execute entities through manifest states"
```

### Task 8: Verify interruption and unchanged-resume behavior

**Files:**
- Create: `packages/migrator/src/manifest/foundation.acceptance.spec.ts`
- Modify: `packages/migrator/README.md`

**Interfaces:**
- Consumes: all prior foundation tasks.
- Produces: an acceptance fixture proving unchanged resume and fatal-stop
  behavior before domain workstreams start.

- [ ] **Step 1: Add a fixture-driven acceptance test**

Build fake YouTrack and target adapters in-process; do not require network or
Docker in the unit suite. Simulate three users and throw a process-style
interruption after the first successful load. Persist manifest responses in the
fake target. Resume with the same run ID and assert:

```typescript
expect(target.createdUserSourceIds).toEqual(['yt-user-1', 'yt-user-2', 'yt-user-3']);
expect(new Set(target.createdUserSourceIds).size).toBe(3);
expect(target.loadCallsBySourceId.get('yt-user-1')).toBe(1);
expect(manifest.statuses()).toEqual(['VERIFIED', 'VERIFIED', 'VERIFIED']);
```

Run the completed fixture again unchanged and assert all three load-call counts
remain unchanged. Change one user's name, recompute its checksum, and assert
only that source ID is loaded and verified again.

- [ ] **Step 2: Add fatal-auth acceptance case**

Make the second load return 401. Assert the third user is never attempted, the
run is not completed, and the terminal output identifies authentication as the
run-level blocker rather than three entity failures.

- [ ] **Step 3: Run the acceptance spec and full migrator gate**

```bash
cd packages/migrator && pnpm test:unit -- foundation.acceptance.spec.ts
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Update operator documentation**

Document the printed run ID, new checkpoint version, resume config immutability,
fatal authentication behavior, and how to inspect manifest status. Explicitly
state that later workstreams are converting domain phases and that a foundation
run alone is not yet a full-fidelity migration release.

- [ ] **Step 5: Run final gates**

```bash
cd apps/api && pnpm test
cd ../../packages/migrator && pnpm test
cd ../.. && pnpm check-types
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/migrator/src/manifest packages/migrator/README.md
git commit -m "test(migrator): prove manifest resume foundation"
```

## Foundation Exit Criteria

- The schema migration applies cleanly and Prisma Client is regenerated.
- The manifest API is guarded, validated, bounded, and integration-tested.
- Secrets never appear in stored config, checkpoint, logs, or responses.
- Resume rejects changed configuration.
- Stable checksums reopen only changed entities.
- The user pilot is source-ID idempotent.
- Fatal authentication stops the run.
- A run cannot complete with failed or unverified entities.
- Interrupted, resumed, unchanged, and changed-source acceptance cases pass.
- API, migrator, and root typecheck gates pass.
