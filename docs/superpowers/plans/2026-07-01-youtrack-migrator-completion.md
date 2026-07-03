# YouTrack Migrator Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the YouTrack→NextTrack migrator move ALL data correctly — custom fields, tags, estimate, issue links, time-tracking, boards/sprints — and preserve rich-text fidelity, closing the silent-data-loss gaps found in the audit.

**Architecture:** The receiving NextTrack modules (Tags, TimeTracking, Sprints, Boards, IssueLinks, CustomFields) already exist and are production-ready. We extend the existing `admin/migration` module with thin endpoints that wrap those services (mirroring the current `createIssue`/`createComment` pattern), add the corresponding loader methods + migration phases in the `@repo/migrator` CLI, and fix two receiving-side correctness bugs. No Prisma schema migrations are required.

**Tech Stack:** NestJS 11, Prisma 7, Zod (nestjs-zod `createZodDto`), vitest (migrator unit tests), jest (api unit/integration), `markdown-it` (new migrator dep for rich-text), commander CLI.

## Global Constraints

- No relative imports in `apps/api/src` — use `@/`, `@repo/shared` aliases (`.claude/rules/nestjs-import-aliases.md`).
- Services throw `DomainError` subclasses, never NestJS HTTP exceptions (`.claude/rules/nestjs-error-handling.md`).
- Prisma enum values via generated constants, never string literals (`.claude/rules/nestjs-prisma-enums.md`).
- Every migration endpoint stays behind `@UseGuards(JwtAuthGuard, MigrationGuard)` (admin JWT + `x-migration-secret`).
- Every `@Body`/whole-`@Query` param typed as a `createZodDto` class (`.claude/rules/nestjs-zod-validation.md`).
- Cross-module reads via readers/existing feature-repo tier; do not touch foreign tables via `PrismaService` directly.
- Migrator: `pnpm` only; tests are vitest specs co-located as `*.spec.ts`, excluded from `dist` by `tsconfig.build.json`, type-checked by base `tsconfig.json`.
- After any Prisma query change, run the `nestjs-query-performance.md` self-check.
- Migrator invocation: `cd packages/migrator && pnpm test` (check-types + vitest); API: `cd apps/api && pnpm test:unit` / `pnpm test:integration`.

## Decisions to confirm during review

1. **Estimate unit mismatch (Phase 3a).** NextTrack `Issue.estimate` = story points (Int); YouTrack `Estimation` = minutes. Plan makes the source field **configurable** via `--estimate-field <name>` (default: unset → estimate not migrated). When the named field is a `PeriodIssueCustomField`, the migrator logs a loud unit-mismatch warning and stores the raw integer (minutes) — the operator opts in knowingly. Confirm whether a story-points integer field exists in the source projects instead.
2. **Issue-link type mapping (Phase 3b).** Default YouTrack→NextTrack map is in Task 3b.2 (`YT_LINKTYPE_MAP`). YouTrack link-type names are project/config-dependent; confirm the source instance's actual link-type names during the pilot dry-run.
3. **Backdating gate (Phase 0).** The plan makes `MIGRATION_ALLOW_BACKDATED_RECORDS=false` **reject** backdated payloads (fail fast) rather than silently ignore them. Confirm this over "silently drop the timestamps."

---

## Phase 0 — Fix the backdating flag (receiving-side bug)

`MIGRATION_ALLOW_BACKDATED_RECORDS` is defined + injected but never read; backdating always happens. This phase makes the flag enforce.

### Task 0.1: Add error code + gate backdating in MigrationService

**Files:**
- Modify: `packages/shared/src/error-codes.ts` (add `MIGRATION_BACKDATING_DISABLED`)
- Modify: `apps/api/src/modules/migration/migration.service.ts`
- Test: `apps/api/test/migration.integration-spec.ts` (or the existing migration integration spec; add a case)

**Interfaces:**
- Produces: `MigrationService` rejects backdated timestamps when `allowBackdatedRecords` is false with `ValidationError(ErrorCode.MIGRATION_BACKDATING_DISABLED)`.

- [ ] **Step 1: Add the error code**

In `packages/shared/src/error-codes.ts`, add to the `ErrorCode` object (alongside the other `MIGRATION_*` codes):

```typescript
  MIGRATION_BACKDATING_DISABLED: 'MIGRATION_BACKDATING_DISABLED',
```

- [ ] **Step 2: Write the failing integration test**

In the migration integration spec, add:

```typescript
it('rejects backdated issue timestamps when backdating is disabled', async () => {
  // ctx built with MIGRATION_ALLOW_BACKDATED_RECORDS unset/false
  const res = await request(ctx.app.getHttpServer())
    .post(`/admin/migration/issues/${projectKey}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('x-migration-secret', MIGRATION_SECRET)
    .send({
      title: 'Backdated',
      statusId,
      reporterId: adminId,
      ytId: 'yt-backdate-1',
      originalCreatedAt: '2020-01-01T00:00:00.000Z',
    });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('MIGRATION_BACKDATING_DISABLED');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=migration`
Expected: FAIL (currently returns 201, backdating silently applied).

- [ ] **Step 4: Add the gate in MigrationService**

Add a private helper and call it wherever original timestamps are honored (`createIssue`, `setOriginalDates`, `createComment`):

```typescript
private assertBackdatingAllowed(hasBackdatedInput: boolean): void {
  if (hasBackdatedInput && !this.migration.allowBackdatedRecords) {
    throw new ValidationError(
      ErrorCode.MIGRATION_BACKDATING_DISABLED,
      'Backdated timestamps are disabled. Set MIGRATION_ALLOW_BACKDATED_RECORDS=true to preserve original dates.',
    );
  }
}
```

In `createIssue`, before `setIssueTimestamps`:

```typescript
this.assertBackdatingAllowed(
  Boolean(dto.originalCreatedAt || dto.originalUpdatedAt || dto.originalResolvedAt),
);
```

In `setOriginalDates(issueId, dto)` at method start:

```typescript
this.assertBackdatingAllowed(true);
```

In `createComment`, before `setCommentTimestamp`:

```typescript
this.assertBackdatingAllowed(Boolean(originalCreatedAt));
```

Import `ValidationError` from `@/common/errors/domain.errors` and `ErrorCode` from `@repo/shared` (verify not already imported).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=migration`
Expected: PASS. Add/keep a companion test asserting that with `allowBackdatedRecords=true` the timestamps ARE applied (existing coverage).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/error-codes.ts apps/api/src/modules/migration/migration.service.ts apps/api/test
git commit -m "fix(migration): enforce MIGRATION_ALLOW_BACKDATED_RECORDS gate"
```

### Task 0.2: Correct the README backdating claim

**Files:**
- Modify: `packages/migrator/README.md`

- [ ] **Step 1: Fix the wording**

The README currently implies the flag is required to preserve dates; that is now TRUE (after 0.1). Keep the `.env` line but ensure the "Known limitations" / config text states: without the flag, migration of backdated records is **rejected** (400 `MIGRATION_BACKDATING_DISABLED`), not silently applied. No code, docs only.

- [ ] **Step 2: Commit**

```bash
git add packages/migrator/README.md
git commit -m "docs(migrator): clarify backdating flag behavior"
```

---

## Phase 1 — Make custom fields actually migrate

Root cause: nothing populates the migrator's `customFields`/`enumOptions` id-maps, so every custom field drops. Fix by exposing the target project's field map and registering it before issues migrate. Also handle multi-value fields.

### Task 1.1: Migration endpoint returning the target project's custom-field map

**Files:**
- Modify: `apps/api/src/modules/migration/dto/migration.schemas.ts` (add result schema) and `migration.dto.ts` (add ZodDto)
- Modify: `apps/api/src/modules/migration/migration.service.ts`
- Modify: `apps/api/src/modules/migration/migration.controller.ts`
- Modify: `apps/api/src/modules/migration/migration.module.ts` (import `CustomFieldsModule`, inject `CustomFieldsRepository`)
- Test: migration integration spec

**Interfaces:**
- Produces: `GET /admin/migration/custom-fields/:projectKey` → `{ data: Array<{ id: string; name: string; type: string; options: Array<{ id: string; name: string }> }> }`
- Consumes: `CustomFieldsRepository.findManyByProject(projectId)` (returns `CustomField[]` with `config.options`).

- [ ] **Step 1: Write the failing integration test**

```typescript
it('returns the project custom-field map with enum options', async () => {
  // Arrange: seed a project + one ENUM field "Severity" with options High/Low
  const res = await request(ctx.app.getHttpServer())
    .get(`/admin/migration/custom-fields/${projectKey}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('x-migration-secret', MIGRATION_SECRET);
  expect(res.status).toBe(200);
  const sev = res.body.data.find((f: any) => f.name === 'Severity');
  expect(sev).toBeDefined();
  expect(sev.options.map((o: any) => o.name).sort()).toEqual(['High', 'Low']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=migration`
Expected: FAIL (404 — route not defined).

- [ ] **Step 3: Add the schema + DTO**

In `dto/migration.schemas.ts`:

```typescript
export const migrationCustomFieldsSchema = z.array(
  z.object({
    id: z.guid(),
    name: z.string(),
    type: z.string(),
    options: z.array(z.object({ id: z.guid(), name: z.string() })),
  }),
);
```

In `migration.dto.ts`:

```typescript
export class MigrationCustomFieldsDto extends createZodDto(migrationCustomFieldsSchema) {}
```

- [ ] **Step 4: Add the service method**

Inject `CustomFieldsRepository` in `MigrationService`. Add:

```typescript
async getCustomFieldMap(projectKey: string) {
  const project = await this.migrationRepo.findProjectByKey(projectKey);
  if (!project) {
    throw new NotFoundError(
      ErrorCode.MIGRATION_PROJECT_NOT_FOUND,
      `Project ${projectKey} not found`,
    );
  }
  const fields = await this.customFieldsRepo.findManyByProject(project.id);
  return {
    data: fields.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      options: (f.config?.options ?? []).map((o) => ({ id: o.id, name: o.name })),
    })),
  };
}
```

- [ ] **Step 5: Add the controller route**

```typescript
@Get('custom-fields/:projectKey')
@ApiEnvelope(MigrationCustomFieldsDto)
getCustomFields(@Param('projectKey') projectKey: string) {
  return this.migrationService.getCustomFieldMap(projectKey);
}
```

- [ ] **Step 6: Wire the module**

In `migration.module.ts` add `CustomFieldsModule` to `imports` (ensure `CustomFieldsRepository` is exported by it; if not, export it — it is already exported for search per module-boundaries doc). Add migration to the consumer list in `.claude/rules/nestjs-module-boundaries.md` (CustomFieldsRepository feature-tier table).

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/api && pnpm test:integration -- --testPathPattern=migration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/migration .claude/rules/nestjs-module-boundaries.md
git commit -m "feat(migration): expose target custom-field map endpoint"
```

### Task 1.2: Loader method + register field map in migrator

**Files:**
- Modify: `packages/migrator/src/loaders/api-client.ts`
- Modify: `packages/migrator/src/commands/migrate.command.ts` (in `migrateProject`)
- Test: `packages/migrator/src/commands/migrate.command.spec.ts` (or a new `id-map.registration.spec.ts`)

**Interfaces:**
- Produces: `OurApiClient.getCustomFieldMap(projectKey): Promise<Array<{ id: string; name: string; type: string; options: Array<{ id: string; name: string }> }>>`
- Consumes: `IdMapService.registerCustomField(name, id)`, `registerEnumOption(fieldName, optionName, optionId)`.

- [ ] **Step 1: Add loader method**

```typescript
async getCustomFieldMap(
  projectKey: string,
): Promise<Array<{ id: string; name: string; type: string; options: Array<{ id: string; name: string }> }>> {
  return retry(async () => {
    const { data } = await this.http.get(`/admin/migration/custom-fields/${projectKey}`);
    return data.data;
  });
}
```

- [ ] **Step 2: Write the failing test for registration helper**

Extract the registration into a testable pure function in the command file:

```typescript
export function registerCustomFieldMap(
  idMap: IdMapService,
  fields: Array<{ id: string; name: string; options: Array<{ id: string; name: string }> }>,
): void {
  for (const field of fields) {
    idMap.registerCustomField(field.name, field.id);
    for (const opt of field.options) {
      idMap.registerEnumOption(field.name, opt.name, opt.id);
    }
  }
}
```

Test:

```typescript
it('registers custom fields and their enum options into the id map', () => {
  const idMap = new IdMapService();
  registerCustomFieldMap(idMap, [
    { id: 'f1', name: 'Severity', options: [{ id: 'o1', name: 'High' }] },
  ]);
  expect(idMap.getCustomFieldId('Severity')).toBe('f1');
  expect(idMap.getEnumOptionId('Severity', 'High')).toBe('o1');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/migrator && pnpm test:unit`
Expected: FAIL (`registerCustomFieldMap` not exported).

- [ ] **Step 4: Implement + wire into `migrateProject`**

Add `registerCustomFieldMap` (above). In `migrateProject`, after the status registration block (migrate.command.ts:~397), and NOT gated by dryRun (registration is read-only and needed for dry-run field validation):

```typescript
const fieldMap = await this.api.getCustomFieldMap(projectKey);
registerCustomFieldMap(this.idMap, fieldMap);
this.reporter.info(`Project ${projectKey}: ${fieldMap.length} custom fields registered`);
```

- [ ] **Step 5: Run tests**

Run: `cd packages/migrator && pnpm test`
Expected: PASS + check-types clean.

- [ ] **Step 6: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): register target custom-field map before issues"
```

### Task 1.3: Handle multi-value + bundle custom fields in the transformer

**Files:**
- Modify: `packages/migrator/src/transformers/issue.transformer.ts`
- Test: `packages/migrator/src/transformers/issue.transformer.spec.ts`

**Interfaces:**
- Produces: `mapFieldValue` returns arrays for multi-value YouTrack fields; unresolved elements drop with a warning.

- [ ] **Step 1: Write failing tests**

```typescript
it('maps a multi-enum custom field to an array of target option ids', () => {
  const sink = vi.fn();
  const t = new IssueTransformer(sink);
  const idMap = idMapWithReporter();
  idMap.registerCustomField('Platforms', 'nt-field-plat');
  idMap.registerEnumOption('Platforms', 'iOS', 'opt-ios');
  idMap.registerEnumOption('Platforms', 'Web', 'opt-web');
  const issue = buildYtIssue({
    customFields: [{
      name: 'Platforms',
      value: [{ name: 'iOS' }, { name: 'Web' }],
      $type: 'MultiEnumIssueCustomField',
    }],
  });
  const dto = t.transform(issue, idMap, statusMap);
  expect(dto.fieldValues).toEqual([{ fieldId: 'nt-field-plat', value: ['opt-ios', 'opt-web'] }]);
});

it('drops unresolved elements of a multi-enum and warns', () => {
  const sink = vi.fn();
  const t = new IssueTransformer(sink);
  const idMap = idMapWithReporter();
  idMap.registerCustomField('Platforms', 'nt-field-plat');
  idMap.registerEnumOption('Platforms', 'iOS', 'opt-ios');
  const issue = buildYtIssue({
    customFields: [{ name: 'Platforms', value: [{ name: 'iOS' }, { name: 'Web' }], $type: 'MultiEnumIssueCustomField' }],
  });
  const dto = t.transform(issue, idMap, statusMap);
  expect(dto.fieldValues).toEqual([{ fieldId: 'nt-field-plat', value: ['opt-ios'] }]);
  expect(sink).toHaveBeenCalledWith({ name: 'Platforms', reason: 'unresolved-value' });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd packages/migrator && pnpm test:unit`
Expected: FAIL (multi-enum falls to default, returns raw array).

- [ ] **Step 3: Implement multi-value handling**

In `mapFieldValue`, before the switch's default, add array handling. Replace the enum/user cases with element-aware logic:

```typescript
private mapFieldValue(ytField: YtCustomField, idMap: IdMapService): unknown {
  if (ytField.value == null) return null;

  const fieldType = ytField.$type ?? ytField.type ?? '';

  if (Array.isArray(ytField.value)) {
    const mapped = ytField.value
      .map((el) => this.mapScalarValue(fieldType, el, ytField.name, idMap))
      .filter((v) => v !== undefined);
    // If nothing resolved but the source had values, signal unresolved.
    if (mapped.length < ytField.value.length) {
      this.noteUnmapped(ytField.name, 'unresolved-value');
    }
    return mapped.length > 0 ? mapped : undefined;
  }

  return this.mapScalarValue(fieldType, ytField.value, ytField.name, idMap);
}

private mapScalarValue(
  fieldType: string,
  value: any,
  fieldName: string,
  idMap: IdMapService,
): unknown {
  switch (fieldType) {
    case 'SingleEnumIssueCustomField':
    case 'EnumIssueCustomField':
    case 'MultiEnumIssueCustomField':
    case 'StateIssueCustomField':
    case 'VersionIssueCustomField':
    case 'OwnedIssueCustomField':
    case 'BuildIssueCustomField':
      return idMap.getEnumOptionId(fieldName, value.name) ?? undefined;
    case 'SingleUserIssueCustomField':
    case 'UserIssueCustomField':
    case 'MultiUserIssueCustomField':
      return idMap.getUserId(value.id) ?? undefined;
    case 'PeriodIssueCustomField':
      return value.minutes;
    case 'DateIssueCustomField':
      return new Date(value).toISOString().split('T')[0];
    default:
      return value.text ?? value;
  }
}
```

Note: the existing single-value `unresolved-value` warning still fires via `mapCustomFields` when `mapScalarValue` returns `undefined`.

- [ ] **Step 4: Run tests**

Run: `cd packages/migrator && pnpm test`
Expected: PASS + check-types.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src/transformers
git commit -m "feat(migrator): map multi-value and bundle custom fields"
```

---

## Phase 2 — Tags

Extract already includes `tags(id,name,color)`. Add: create project tags + link to issues.

### Task 2.1: Migration endpoints for tag create + link

**Files:**
- Modify: migration schemas + dto, service, controller, module (import `TagsModule`, inject `TagsService` + `TagsRepository`)
- Test: migration integration spec

**Interfaces:**
- Produces:
  - `POST /admin/migration/projects/:projectKey/tags` body `{ name: string; color: string }` → `{ data: { id, name }, existed: boolean }` (idempotent by project+name)
  - `POST /admin/migration/issues/:issueId/tags` body `{ tagIds: string[] }` → `{ data: { linked: number } }`
- Consumes: `TagsService.create(projectId, { name, color })`, `TagsRepository.linkToIssue(issueId, tagId, projectId)`.

- [ ] **Step 1: Failing integration test**

```typescript
it('creates a project tag (idempotent) and links it to an issue', async () => {
  const tagRes = await request(ctx.app.getHttpServer())
    .post(`/admin/migration/projects/${projectKey}/tags`)
    .set('Authorization', `Bearer ${adminToken}`).set('x-migration-secret', MIGRATION_SECRET)
    .send({ name: 'regression', color: 'red' });
  expect(tagRes.status).toBe(201);
  const tagId = tagRes.body.data.id;

  const linkRes = await request(ctx.app.getHttpServer())
    .post(`/admin/migration/issues/${issueId}/tags`)
    .set('Authorization', `Bearer ${adminToken}`).set('x-migration-secret', MIGRATION_SECRET)
    .send({ tagIds: [tagId] });
  expect(linkRes.status).toBe(201);
  expect(linkRes.body.data.linked).toBe(1);
});
```

- [ ] **Step 2: Run to verify fail** — Run `pnpm test:integration -- --testPathPattern=migration`; Expected FAIL (routes 404).

- [ ] **Step 3: Add schemas + DTOs**

```typescript
// migration.schemas.ts
export const migrationCreateTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().min(1),
});
export const migrationLinkTagsSchema = z.object({
  tagIds: z.array(z.guid()).min(1),
});
// migration.dto.ts
export class MigrationCreateTagDto extends createZodDto(migrationCreateTagSchema) {}
export class MigrationLinkTagsDto extends createZodDto(migrationLinkTagsSchema) {}
```

- [ ] **Step 4: Service methods**

Inject `TagsService`, `TagsRepository`. Add:

```typescript
async createTag(projectKey: string, dto: { name: string; color: string }) {
  const project = await this.requireProject(projectKey); // extract the findProjectByKey+throw into a helper
  try {
    const tag = await this.tagsService.create(project.id, dto);
    return { data: { id: tag.id, name: tag.name }, existed: false };
  } catch (err) {
    if (err instanceof ConflictError && err.code === ErrorCode.TAG_NAME_TAKEN) {
      const existing = await this.tagsRepo.findByProjectAndName(project.id, dto.name);
      return { data: { id: existing!.id, name: existing!.name }, existed: true };
    }
    throw err;
  }
}

async linkIssueTags(issueId: string, tagIds: string[]) {
  const issue = await this.migrationRepo.findIssueById(issueId); // add if missing; needs projectId
  if (!issue) throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND, `Issue ${issueId} not found`);
  await this.tagsRepo.replaceIssueLinksBulk([issueId], tagIds, issue.projectId);
  return { data: { linked: tagIds.length } };
}
```

Note: verify `TagsRepository.findByProjectAndName` exists; if not, use the case-insensitive lookup the service already uses for conflict detection (quote-check during implementation) or add a thin repo read. Verify `ConflictError`/`ErrorCode.TAG_NAME_TAKEN` names against `tags.service.ts`.

- [ ] **Step 5: Controller routes**

```typescript
@Post('projects/:projectKey/tags')
@ApiEnvelope(MigrationTagResultDto, { status: HttpStatus.CREATED })
createTag(@Param('projectKey') projectKey: string, @Body() dto: MigrationCreateTagDto) {
  return this.migrationService.createTag(projectKey, dto);
}

@Post('issues/:issueId/tags')
@ApiEnvelope(MigrationTagLinkResultDto, { status: HttpStatus.CREATED })
linkTags(@Param('issueId') issueId: string, @Body() dto: MigrationLinkTagsDto) {
  return this.migrationService.linkIssueTags(issueId, dto.tagIds);
}
```

Add matching result schemas/DTOs (`migrationTagResultSchema = z.object({ id: z.guid(), name: z.string() })`, `migrationTagLinkResultSchema = z.object({ linked: z.number().int() })`).

- [ ] **Step 6: Module wiring** — import `TagsModule` in `migration.module.ts`.

- [ ] **Step 7: Run tests** — `pnpm test:integration -- --testPathPattern=migration`; Expected PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/migration
git commit -m "feat(migration): tag create + issue-tag link endpoints"
```

### Task 2.2: Loader methods + tag migration in migrator

**Files:**
- Modify: `packages/migrator/src/loaders/api-client.ts`, `packages/migrator/src/commands/migrate.command.ts`, `packages/migrator/src/id-map/id-map.service.ts` (add tag map)
- Test: migrate.command.spec.ts

**Interfaces:**
- Produces: `OurApiClient.createTag(projectKey, {name,color}): Promise<{id:string}>`, `OurApiClient.linkIssueTags(issueId, tagIds): Promise<void>`; `IdMapService.registerTag/getTagId`.

- [ ] **Step 1: Add tag map to IdMapService**

```typescript
private tags: Map<string, string> = new Map(); // `${projectKey}:${tagName}` → tagId
registerTag(projectKey: string, name: string, ourId: string): void {
  this.tags.set(`${projectKey}:${name}`, ourId);
}
getTagId(projectKey: string, name: string): string | null {
  return this.tags.get(`${projectKey}:${name}`) ?? null;
}
```
Add `tags` to `serialize()`/`deserialize()`.

- [ ] **Step 2: Add loader methods** (mirror existing `retry`+post pattern in api-client.ts).

- [ ] **Step 3: Add tag phase in migrate.command** — a new phase AFTER issues (so issue ids exist), BEFORE or after comments. Per issue with `ytIssue.tags`:
  - Ensure each tag exists: if `idMap.getTagId(projectKey, tag.name)` is null → `api.createTag(...)` → register. Map YouTrack `tag.color` to a NextTrack color name (fallback `'gray'`; add a small `mapTagColor(ytColor)` helper — dry-run logs `[DRY] Would create tag`).
  - Collect the target tagIds for the issue → `api.linkIssueTags(ourIssueId, tagIds)` (skip in dry-run with a `[DRY]` log).
  - Bound: dedup tag creation via the id-map (no create-in-loop for known tags).

- [ ] **Step 4: Test** the `mapTagColor` helper + a dry-run guard unit test (pure logic).

- [ ] **Step 5: Run** `cd packages/migrator && pnpm test`; Expected PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): migrate issue tags"
```

---

## Phase 3a — Estimate (configurable source field)

### Task 3a.1: Add `--estimate-field` and populate DTO.estimate

**Files:**
- Modify: `packages/migrator/src/cli.ts` (add option), `migrate.command.ts` (`MigrateOptions` + thread through), `packages/migrator/src/transformers/issue.transformer.ts` (accept estimate field name, read it)
- Test: issue.transformer.spec.ts

**Interfaces:**
- Consumes: `MigrateOptions.estimateField?: string`
- Produces: `IssueTransformer.transform(issue, idMap, statusMap, opts?: { estimateFieldName?: string })` sets `estimate` from the named custom field's integer/minutes value.

- [ ] **Step 1: Failing test**

```typescript
it('populates estimate from the configured custom field (integer)', () => {
  const t = new IssueTransformer();
  const issue = buildYtIssue({
    customFields: [{ name: 'Story points', value: 8, $type: 'IntegerIssueCustomField' }],
  });
  const dto = t.transform(issue, idMapWithReporter(), statusMap, { estimateFieldName: 'Story points' });
  expect(dto.estimate).toBe(8);
});

it('warns about unit mismatch when the estimate field is a period', () => {
  const sink = vi.fn();
  const t = new IssueTransformer(sink);
  const issue = buildYtIssue({
    customFields: [{ name: 'Estimation', value: { minutes: 480 }, $type: 'PeriodIssueCustomField' }],
  });
  const dto = t.transform(issue, idMapWithReporter(), statusMap, { estimateFieldName: 'Estimation' });
  expect(dto.estimate).toBe(480);
  expect(sink).toHaveBeenCalledWith({ name: 'Estimation', reason: 'estimate-unit-mismatch' });
});
```

Extend `UnmappedFieldReason` union with `'estimate-unit-mismatch'` and the command's `formatUnmappedField` with a message ("value is time in minutes but target estimate is story points — stored as-is").

- [ ] **Step 2: Run to verify fail** — `pnpm test:unit`; Expected FAIL.

- [ ] **Step 3: Implement**

In `transform`, replace `estimate: null` with `estimate: this.resolveEstimate(ytIssue, opts?.estimateFieldName)`:

```typescript
private resolveEstimate(ytIssue: YtIssue, fieldName?: string): number | null {
  if (!fieldName) return null;
  const field = ytIssue.customFields?.find((f) => f.name === fieldName);
  if (!field || field.value == null) return null;
  const type = field.$type ?? field.type ?? '';
  if (type === 'PeriodIssueCustomField') {
    this.noteUnmapped(fieldName, 'estimate-unit-mismatch');
    return typeof field.value.minutes === 'number' ? field.value.minutes : null;
  }
  const n = typeof field.value === 'number' ? field.value : Number(field.value?.name ?? field.value);
  return Number.isFinite(n) ? Math.round(n) : null;
}
```

Add the CLI option `--estimate-field <name>` in `cli.ts` and thread `estimateField` through `MigrateOptions` and the `transform(..., { estimateFieldName: options.estimateField })` call in `migrateIssues`.

- [ ] **Step 4: Run tests** — `cd packages/migrator && pnpm test`; Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): configurable estimate source field"
```

---

## Phase 3b — Issue links (non-parent)

### Task 3b.1: Extract links from YouTrack

**Files:**
- Modify: `packages/migrator/src/extractors/issues.extractor.ts` (add `links(...)` to `ISSUE_FIELDS`), `packages/migrator/src/youtrack/types/yt-issue.type.ts` (add `links`)
- Test: n/a (query string change; covered by 3b.3 mapping test)

- [ ] **Step 1: Add the field + type**

Add to `ISSUE_FIELDS`:

```typescript
'links(direction,linkType(name,sourceToTarget,targetToSource),issues(id))',
```

Add to `YtIssue`:

```typescript
links?: {
  direction: 'OUTWARD' | 'INWARD' | 'BOTH';
  linkType: { name: string; sourceToTarget: string; targetToSource: string };
  issues: { id: string }[];
}[];
```

- [ ] **Step 2: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): extract issue links from YouTrack"
```

### Task 3b.2: Map YouTrack link (type+direction) → NextTrack frontend link type

**Files:**
- Create: `packages/migrator/src/transformers/link.transformer.ts`
- Test: `packages/migrator/src/transformers/link.transformer.spec.ts`

**Interfaces:**
- Produces: `mapYtLink(linkTypeName: string, direction: 'OUTWARD'|'INWARD'|'BOTH'): FrontendLinkType | null` where `FrontendLinkType = 'BLOCKS'|'IS_BLOCKED_BY'|'RELATES_TO'|'DUPLICATES'|'IS_DUPLICATED_BY'`. Subtask/parent links → `null` (handled by parent phase). Emits one link record per OUTWARD (and BOTH) direction to avoid double-creation.

- [ ] **Step 1: Failing tests**

```typescript
it('maps Depend outward to BLOCKS and inward to IS_BLOCKED_BY', () => {
  expect(mapYtLink('Depend', 'OUTWARD')).toBe('BLOCKS');       // "is required for"
  expect(mapYtLink('Depend', 'INWARD')).toBe('IS_BLOCKED_BY'); // "depends on"
});
it('maps Duplicate directions', () => {
  expect(mapYtLink('Duplicate', 'OUTWARD')).toBe('DUPLICATES');
  expect(mapYtLink('Duplicate', 'INWARD')).toBe('IS_DUPLICATED_BY');
});
it('maps Relates (symmetric) to RELATES_TO only on OUTWARD/BOTH', () => {
  expect(mapYtLink('Relates', 'BOTH')).toBe('RELATES_TO');
});
it('returns null for Subtask (handled by parent phase)', () => {
  expect(mapYtLink('Subtask', 'OUTWARD')).toBeNull();
});
it('returns null for unknown link types', () => {
  expect(mapYtLink('Frobnicate', 'OUTWARD')).toBeNull();
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm test:unit`; Expected FAIL.

- [ ] **Step 3: Implement**

```typescript
export type FrontendLinkType =
  | 'BLOCKS' | 'IS_BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES' | 'IS_DUPLICATED_BY';

// Keyed by YouTrack linkType.name (default instance names). Configurable during review.
const YT_LINKTYPE_MAP: Record<string, { outward: FrontendLinkType | null; inward: FrontendLinkType | null; symmetric?: boolean }> = {
  Depend: { outward: 'BLOCKS', inward: 'IS_BLOCKED_BY' },
  Duplicate: { outward: 'DUPLICATES', inward: 'IS_DUPLICATED_BY' },
  Relates: { outward: 'RELATES_TO', inward: null, symmetric: true },
  Subtask: { outward: null, inward: null }, // parent/child handled separately
};

export function mapYtLink(
  linkTypeName: string,
  direction: 'OUTWARD' | 'INWARD' | 'BOTH',
): FrontendLinkType | null {
  const entry = YT_LINKTYPE_MAP[linkTypeName];
  if (!entry) return null;
  if (entry.symmetric) return direction === 'INWARD' ? null : entry.outward; // emit once
  return direction === 'INWARD' ? entry.inward : entry.outward;
}
```

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src/transformers
git commit -m "feat(migrator): YouTrack link-type mapping"
```

### Task 3b.3: Migration endpoint + links phase

**Files:**
- Modify: migration schemas/dto, service, controller, module (import `IssueLinksModule`, inject `IssueLinksService`)
- Modify: `packages/migrator/src/loaders/api-client.ts`, `migrate.command.ts`
- Test: migration integration spec + a migrator dry-run guard test

**Interfaces:**
- Produces: `POST /admin/migration/issues/:issueId/links` body `{ type: FrontendLinkType; targetIssueId: string }` → `{ data: { id } }`, wrapping `IssueLinksService.create(issueId, dto, migrationUserId)`. Use the requesting admin's id as `userId` (from `req.user`) — thread it via a `@CurrentUser()`/request param already used elsewhere, or resolve the migration system user.

- [ ] **Step 1: Failing integration test** — create two issues, POST a `RELATES_TO` link, assert 201 and that the link is queryable.

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Add schema/dto** (`migrationCreateLinkSchema = z.object({ type: z.enum(['BLOCKS','IS_BLOCKED_BY','RELATES_TO','DUPLICATES','IS_DUPLICATED_BY']), targetIssueId: z.guid() })`), service method `createLink(issueId, dto, userId)` calling `issueLinksService.create`, controller route with the admin user id.

- [ ] **Step 4: Loader + phase** — `api.createIssueLink(sourceIssueId, { type, targetIssueId })`; new links phase after issues+parents: for each issue's `links`, `mapYtLink` → resolve both ids via `idMap.getIssueId` → skip nulls/unmapped → create. Dry-run logs `[DRY] Would link`. Skip self and duplicate (rely on server's unique constraint + cycle check; catch+record conflict).

- [ ] **Step 5: Run tests** (api integration + migrator).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/migration packages/migrator/src
git commit -m "feat(migration): issue-link endpoint + migrator links phase"
```

---

## Phase 4a — Time-tracking (finish the stub)

### Task 4a.1: Bulk time-log migration endpoint

**Files:**
- Modify: migration schemas/dto, service, controller, module (import `TimeTrackingModule`, inject `TimeLogsRepository`)
- Test: migration integration spec

**Interfaces:**
- Produces: `POST /admin/migration/issues/:issueId/time-logs` body `{ entries: Array<{ userId: string; minutes: number; date: string; description?: string | null }> }` → `{ data: { created: number } }`. Uses `TimeLogsRepository.create({ issueId, userId, duration, date, description, source: TimeLogSource.IMPORT }, tx)` inside a `$transaction`, then recalculates `issue.spent`.

- [ ] **Step 1: Failing integration test** — POST two entries, assert `created: 2` and `issue.spent` equals the sum of minutes.

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Add schema/dto**

```typescript
export const migrationTimeLogsSchema = z.object({
  entries: z.array(z.object({
    userId: z.guid(),
    minutes: z.number().int().min(1).max(8766240),
    date: z.iso.datetime(),
    description: z.string().max(1000).nullable().optional(),
  })).min(1),
});
```

- [ ] **Step 4: Service method**

```typescript
async createTimeLogs(issueId: string, entries: MigrationTimeLogEntry[]) {
  const issue = await this.migrationRepo.findIssueById(issueId);
  if (!issue) throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND, `Issue ${issueId} not found`);
  await this.txService.run(async (tx) => {
    for (const e of entries) {
      await this.timeLogsRepo.create({
        issueId, userId: e.userId, duration: e.minutes,
        date: new Date(e.date), description: e.description ?? null,
        source: TimeLogSource.IMPORT,
      }, tx);
    }
    await this.timeLogsRepo.recalculateSpent(issueId, tx); // verify method name/signature in time-logs.repository.ts
  });
  return { data: { created: entries.length } };
}
```

Verify `recalculateSpent` exists (the service uses one at time-logs.service.ts:308); if it's on the service not the repo, inject `TimeLogsService` and call its recalc, or replicate the repo call. Use `TimeLogSource` from `@prisma/client`.

- [ ] **Step 5: Controller route + module import.**

- [ ] **Step 6: Run tests** — PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/migration
git commit -m "feat(migration): bulk time-log import endpoint"
```

### Task 4a.2: Implement migrator time-log phase + drop the guard

**Files:**
- Modify: `packages/migrator/src/loaders/api-client.ts`, `migrate.command.ts` (replace `migrateTimeLogs` stub body; remove `withTimeTracking` from `UNSUPPORTED_FLAGS`)
- Test: migrate.command.spec.ts (guard test now only lists `--with-boards`; add after Phase 4b removes boards too)

- [ ] **Step 1: Update the guard test** — `unsupportedMigrationFlags({ withTimeTracking: true, withBoards: false })` now returns `[]`. Adjust the spec.

- [ ] **Step 2: Run to verify fail** (spec expects old behavior).

- [ ] **Step 3: Implement** — remove `withTimeTracking` from `UNSUPPORTED_FLAGS`; replace `migrateTimeLogs` real-run body: batch each issue's work items into one `api.createTimeLogs(ourIssueId, entries)` call, mapping `entry.author.id`→`idMap.getUserId`, `entry.duration.minutes`→`minutes`, `new Date(entry.date).toISOString()`→`date`, `entry.text`→`description`. Skip entries whose author is unmapped (warn). Keep the dry-run `[DRY]` log.

- [ ] **Step 4: Run** `cd packages/migrator && pnpm test`; Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): migrate time logs; drop unsupported-flag guard"
```

---

## Phase 4b — Boards / sprints (finish the stub)

### Task 4b.1: Migration endpoints for board + sprint + sprint-membership

**Files:**
- Modify: migration schemas/dto, service, controller, module (import `BoardsModule`, `SprintsModule`; inject `BoardsService`, `SprintsService`)
- Test: migration integration spec

**Interfaces:**
- Produces:
  - `POST /admin/migration/projects/:projectKey/boards` body `{ name; type: 'KANBAN'|'SCRUM' }` → `{ data: { id } }` (wraps `BoardsService.create(project, dto, userId)`; need `ProjectEntity` — fetch via projects repo/reader).
  - `POST /admin/migration/boards/:boardId/sprints` body `{ name; goal?; startDate?; endDate? }` → `{ data: { id } }` (wraps `SprintsService.create`).
  - `POST /admin/migration/boards/:boardId/sprints/:sprintId/issues` body `{ issueIds: string[] }` → `{ data: { added } }` (wraps `SprintsService.addIssues`).

- [ ] **Step 1: Failing integration test** — create SCRUM board → create sprint → add an issue → assert `issue.sprintId` set.

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Schemas/DTOs** mirroring the shared `createBoardSchema`/`createSprintSchema` fields (reuse those schemas directly where possible to avoid drift).

- [ ] **Step 4: Service methods** — `createBoard`, `createSprint`, `addSprintIssues`; fetch `ProjectEntity` for `BoardsService.create` (inject `ProjectsReader`/repo; confirm the exact entity type `BoardsService.create` expects and how projects are loaded elsewhere in migration.service).

- [ ] **Step 5: Controller routes + module imports.**

- [ ] **Step 6: Run tests** — PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/migration
git commit -m "feat(migration): board/sprint import endpoints"
```

### Task 4b.2: Migrator boards/sprints phase + drop guard

**Files:**
- Modify: `packages/migrator/src/loaders/api-client.ts`, `migrate.command.ts` (add boards phase, remove `withBoards` from `UNSUPPORTED_FLAGS`; `BoardsExtractor` already exists), `id-map.service.ts` (sprint map)
- Test: migrate.command.spec.ts (guard now returns `[]` for both flags)

- [ ] **Step 1: Update guard test** — `unsupportedMigrationFlags({ withBoards: true, withTimeTracking: true })` → `[]`; if `UNSUPPORTED_FLAGS` is now empty, replace the abort test with one asserting the guard passes (no exit) for those flags, and keep `unsupportedMigrationFlags` returning `[]`. Consider keeping the mechanism for future flags.

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement boards phase** — for each YouTrack agile board mapped to the project: create ONE SCRUM board (or reuse the project's existing default board — confirm during review whether to create or reuse); create each sprint (`start`/`finish` epoch → ISO); for each sprint's `issues`, resolve `idMap.getIssueId` and call `addSprintIssues(boardId, sprintId, issueIds)`. Also honor per-issue `ytIssue.sprint` as a fallback membership signal. Register sprint ids in the id-map. Dry-run `[DRY]` logs. Remove `withBoards` from `UNSUPPORTED_FLAGS`; add the phase to `run()` and `countSteps`.

- [ ] **Step 4: Run** `cd packages/migrator && pnpm test`; Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): migrate boards and sprints"
```

---

## Phase 5 — Rich-text fidelity (Markdown → Tiptap)

Replace the naive paragraph splitter with a real Markdown→Tiptap converter used for BOTH issue descriptions and comments.

**Dependency justification:** add `markdown-it` (^14) to `packages/migrator`. It is the de-facto CommonMark parser, small, dependency-light, and gives a clean token stream. Rejected alternatives: headless `@tiptap/core` + `generateJSON` (needs a DOM in Node), `prosemirror-markdown` (its default schema uses `strong`/`em`/`bullet_list` node/mark names that mismatch Tiptap's `bold`/`italic`/`bulletList`, requiring translation anyway). Hand-rolling a Markdown parser is rejected (reinventing a complex wheel).

### Task 5.1: `markdownToTiptap` converter

**Files:**
- Create: `packages/migrator/src/transformers/markdown-to-tiptap.ts`
- Test: `packages/migrator/src/transformers/markdown-to-tiptap.spec.ts`
- Modify: `packages/migrator/package.json` (add `markdown-it` + `@types/markdown-it`)

**Interfaces:**
- Produces: `markdownToTiptap(markdown: string): TiptapDoc` emitting Tiptap-schema JSON with node names `doc, paragraph, heading, bulletList, orderedList, listItem, codeBlock, blockquote, horizontalRule, hardBreak, image, text` and mark names `bold, italic, strike, code, link` (matching `@tiptap/starter-kit` 3.20.1 + extension-link/image used by `apps/web`).

- [ ] **Step 1: Add dependency**

```bash
cd packages/migrator && pnpm add markdown-it && pnpm add -D @types/markdown-it
```

- [ ] **Step 2: Failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { markdownToTiptap } from './markdown-to-tiptap';

it('converts a heading', () => {
  expect(markdownToTiptap('# Title')).toEqual({
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] }],
  });
});

it('converts bold and italic marks', () => {
  const doc = markdownToTiptap('a **b** and *c*');
  const marks = doc.content![0].content!;
  expect(marks).toContainEqual({ type: 'text', text: 'b', marks: [{ type: 'bold' }] });
  expect(marks).toContainEqual({ type: 'text', text: 'c', marks: [{ type: 'italic' }] });
});

it('converts a fenced code block with language', () => {
  const doc = markdownToTiptap('```ts\nconst x = 1;\n```');
  expect(doc.content![0]).toEqual({
    type: 'codeBlock',
    attrs: { language: 'ts' },
    content: [{ type: 'text', text: 'const x = 1;\n' }],
  });
});

it('converts a bullet list', () => {
  const doc = markdownToTiptap('- one\n- two');
  expect(doc.content![0].type).toBe('bulletList');
  expect(doc.content![0].content).toHaveLength(2);
  expect(doc.content![0].content![0].type).toBe('listItem');
});

it('converts a link', () => {
  const doc = markdownToTiptap('[x](https://e.com)');
  expect(doc.content![0].content![0]).toEqual({
    type: 'text', text: 'x',
    marks: [{ type: 'link', attrs: { href: 'https://e.com' } }],
  });
});

it('falls back to a single paragraph for empty/plain input', () => {
  expect(markdownToTiptap('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  expect(markdownToTiptap('plain line')).toEqual({
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain line' }] }],
  });
});
```

- [ ] **Step 3: Run to verify fail** — `pnpm test:unit`; Expected FAIL (module missing).

- [ ] **Step 4: Implement the converter**

Use `markdown-it`'s token stream. Build a recursive token→node walker. Full implementation (this file is the core deliverable — write it completely):

```typescript
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token';
import { TiptapDoc } from '@repo/shared/schemas/tiptap.schema';

const md = new MarkdownIt('commonmark', { html: false, linkify: true, breaks: false });

type Mark = { type: string; attrs?: Record<string, unknown> };

// Inline tokens → Tiptap inline content (text nodes with marks, images, hardBreaks).
function inlineToNodes(tokens: Token[]): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  const marks: Mark[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.content) out.push({ type: 'text', text: t.content, ...(marks.length ? { marks: [...marks] } : {}) });
        break;
      case 'softbreak':
        out.push({ type: 'text', text: ' ', ...(marks.length ? { marks: [...marks] } : {}) });
        break;
      case 'hardbreak':
        out.push({ type: 'hardBreak' });
        break;
      case 'code_inline':
        out.push({ type: 'text', text: t.content, marks: [...marks, { type: 'code' }] });
        break;
      case 'strong_open': marks.push({ type: 'bold' }); break;
      case 'em_open': marks.push({ type: 'italic' }); break;
      case 's_open': marks.push({ type: 'strike' }); break;
      case 'strong_close':
      case 'em_close':
      case 's_close': marks.pop(); break;
      case 'link_open': marks.push({ type: 'link', attrs: { href: t.attrGet('href') ?? '' } }); break;
      case 'link_close': marks.pop(); break;
      case 'image':
        out.push({ type: 'image', attrs: { src: t.attrGet('src') ?? '', alt: t.content || null } });
        break;
      default:
        break;
    }
  }
  return out;
}

function blocksToNodes(tokens: Token[], start: number, end: number): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i];
    switch (t.type) {
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        out.push({ type: 'paragraph', content: inline?.children ? inlineToNodes(inline.children) : [] });
        i += 3; // open, inline, close
        break;
      }
      case 'heading_open': {
        const level = Number(t.tag.slice(1));
        const inline = tokens[i + 1];
        out.push({ type: 'heading', attrs: { level }, content: inline?.children ? inlineToNodes(inline.children) : [] });
        i += 3;
        break;
      }
      case 'fence':
      case 'code_block':
        out.push({
          type: 'codeBlock',
          attrs: { language: t.info?.trim() || null },
          content: t.content ? [{ type: 'text', text: t.content }] : [],
        });
        i += 1;
        break;
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closeType = t.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
        const listEnd = findClose(tokens, i, t.type, closeType);
        out.push({
          type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList',
          content: listItems(tokens, i + 1, listEnd),
        });
        i = listEnd + 1;
        break;
      }
      case 'blockquote_open': {
        const qEnd = findClose(tokens, i, 'blockquote_open', 'blockquote_close');
        out.push({ type: 'blockquote', content: blocksToNodes(tokens, i + 1, qEnd) });
        i = qEnd + 1;
        break;
      }
      case 'hr':
        out.push({ type: 'horizontalRule' });
        i += 1;
        break;
      default:
        i += 1;
        break;
    }
  }
  return out;
}

function listItems(tokens: Token[], start: number, end: number): TiptapDoc[] {
  const items: TiptapDoc[] = [];
  let i = start;
  while (i < end) {
    if (tokens[i].type === 'list_item_open') {
      const itemEnd = findClose(tokens, i, 'list_item_open', 'list_item_close');
      items.push({ type: 'listItem', content: blocksToNodes(tokens, i + 1, itemEnd) });
      i = itemEnd + 1;
    } else {
      i += 1;
    }
  }
  return items;
}

// Finds the matching close index, respecting nesting of the same open/close pair.
function findClose(tokens: Token[], openIdx: number, openType: string, closeType: string): number {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth++;
    else if (tokens[i].type === closeType) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

export function markdownToTiptap(markdown: string): TiptapDoc {
  const src = (markdown ?? '').trim();
  if (!src) return { type: 'doc', content: [{ type: 'paragraph' }] };
  const tokens = md.parse(src, {});
  const content = blocksToNodes(tokens, 0, tokens.length);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
```

Note during implementation: confirm the `markdown-it` token type import path (`markdown-it/lib/token` vs `markdown-it`), and that `commonmark` preset emits `s_open`/`s_close` (strikethrough is a plugin in strict CommonMark — if not present those cases are simply never hit, which is fine). Adjust the empty-paragraph shape if `tiptapContentSchema` rejects a paragraph with no `content` (it accepts any `type:'doc'`).

- [ ] **Step 5: Run tests** — `cd packages/migrator && pnpm test`; Expected PASS. Fix walker edge cases until green.

- [ ] **Step 6: Commit**

```bash
git add packages/migrator/package.json packages/migrator/src/transformers/markdown-to-tiptap.ts packages/migrator/src/transformers/markdown-to-tiptap.spec.ts pnpm-lock.yaml
git commit -m "feat(migrator): real Markdown to Tiptap converter"
```

### Task 5.2: Use the converter for descriptions and comments

**Files:**
- Modify: `packages/migrator/src/transformers/issue.transformer.ts` (replace `convertMarkdownToTiptap`)
- Modify: `packages/migrator/src/commands/migrate.command.ts` (comment body in `migrateComments`)
- Test: issue.transformer.spec.ts (description now structured)

- [ ] **Step 1: Failing test** — a description with a bullet list now yields a `bulletList` node (not one flattened paragraph):

```typescript
it('converts a markdown description into structured Tiptap', () => {
  const t = new IssueTransformer();
  const dto = t.transform(
    buildYtIssue({ description: '# H\n\n- a\n- b' }),
    idMapWithReporter(), statusMap,
  );
  expect(dto.description.content[0]).toEqual({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H' }] });
  expect(dto.description.content[1].type).toBe('bulletList');
});
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement** — delete `convertMarkdownToTiptap`; in `transform`, `description: ytIssue.description ? markdownToTiptap(ytIssue.description) : null`. In `migrateComments`, replace the hard-coded paragraph with `const body = markdownToTiptap(comment.text);`.

- [ ] **Step 4: Run tests** — `cd packages/migrator && pnpm test`; Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/migrator/src
git commit -m "feat(migrator): use Markdown->Tiptap for descriptions and comments"
```

---

## Final verification (after all phases)

- [ ] `cd apps/api && pnpm test` (check-types → lint → unit → integration).
- [ ] `cd packages/migrator && pnpm test` (check-types → vitest).
- [ ] `cd apps/api && pnpm test:e2e` if any bootstrap/module wiring changed (new module imports) — per `feedback_full_gate_includes_e2e`.
- [ ] Update `packages/migrator/README.md`: mark tags, custom fields, estimate, links, time-tracking, boards/sprints as migrated; document `--estimate-field`; remove the "Rejected" markers on `--with-boards`/`--with-time-tracking`; note the rich-text converter's coverage and any known unsupported Markdown.
- [ ] Update `.claude/rules/nestjs-module-boundaries.md` consumer tables for any new cross-module injections (CustomFieldsRepository, TagsService/Repository, TimeLogsRepository, SprintsService, BoardsService, IssueLinksService, ProjectsReader → migration).
- [ ] Boy-scout: the previously-dead `migrateTimeLogs`/boards scaffolding is now live; confirm no dead branches remain in `countSteps`/`run()`.

## Self-review notes (author checklist, done)

- Spec coverage: every audit gap maps to a task — custom fields (1.1–1.3), tags (2.x), estimate (3a), links (3b), time-tracking (4a), boards/sprints (4b), rich-text (5.x), backdating bug (0.1). Attachment author/created + comment `updated` + comment-attachments are intentionally OUT of scope for this round (LOW severity) — track separately.
- Type consistency: `FrontendLinkType` union used identically in `link.transformer.ts` and the Phase 3b DTO; `TiptapDoc` from `@repo/shared/schemas/tiptap.schema`; `TimeLogSource.IMPORT` from `@prisma/client`.
- Placeholders: none — the two "verify during implementation" notes (CustomFieldType enum not needed; `recalculateSpent` location) are confirmations of exact symbol names, not missing logic.
