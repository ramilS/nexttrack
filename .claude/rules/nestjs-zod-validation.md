# Zod Validation Quality Rules

## DTO Wiring: createZodDto + Global Pipe

Controller inputs are validated by the global `AppZodValidationPipe` (an
`APP_PIPE` in `AppModule`): it validates any handler param whose type is a
`createZodDto` class and renders it into the OpenAPI document at `/docs`
(`SWAGGER_ENABLED`, off by default).

```typescript
// <module>.dto.ts — thin wrappers; packages/shared stays NestJS-free
import { createZodDto } from 'nestjs-zod';
import { createTagSchema } from '@repo/shared/schemas';
export class CreateTagDto extends createZodDto(createTagSchema) {}

// Controller — no per-call-site pipe
@Post()
async create(@ReqProject() project: Project, @Body() dto: CreateTagDto) { ... }
```

### Wrong

```typescript
// Legacy pattern — per-call-site pipe instance (removed from the codebase)
@Body(new ZodValidationPipe(createTagSchema)) dto: CreateTagInput,

// Bare param — never validated, never in the OpenAPI doc
@Body() dto: CreateTagInput,
```

Every `@Body()`/whole-object `@Query()` param MUST be typed as a ZodDto class.
Services keep accepting the `XInput`/`XParsed` types from `@repo/shared` —
DTO instances are structurally identical.

## Principle: Validate Shape, Format, AND Business Constraints

A Zod schema must validate three levels — not just "is it a string?":

1. **Type** — `z.string()`, `z.number()`, `z.boolean()`
2. **Format** — `z.email()`, `z.guid()`, `z.iso.datetime()`, `z.url()`, `.regex()`
3. **Constraints** — `.min()`, `.max()`, `.refine()`, `.superRefine()`

## String Fields

### Always add format validation

```typescript
// Wrong — accepts any string
email: z.string(),
date: z.string(),
projectKey: z.string(),

// Correct — validates format
email: z.string().trim().toLowerCase().pipe(z.email()),
date: z.iso.datetime(),
projectKey: z.string().min(2).max(10).regex(/^[A-Z][A-Z0-9]+$/),
```

### Always `.trim()` user-facing text, `.toLowerCase()` emails

```typescript
name: z.string().min(1).max(255).trim(),
title: z.string().min(1).max(500).trim(),
email: z.string().trim().toLowerCase().pipe(z.email()),
```

## ID Fields — `z.guid()`, NOT `z.uuid()`

zod v4's `z.uuid()` enforces RFC 9562 version/variant bits. Our seeded system
roles use synthetic IDs (`00000000-0000-0000-0000-00000000000[1-5]`) that fail
that check, and Postgres's `uuid` type itself accepts any 8-4-4-4-12 hex
layout. `z.guid()` matches what the DB actually stores.

```typescript
// Wrong — rejects seeded system-role IDs in production
roleId: z.uuid(),

// Correct — same set of values the Postgres uuid type accepts
roleId: z.guid(),
```

## Number Fields

### Always set min AND max bounds

```typescript
// Wrong — unbounded, can cause storage/logic issues
age: z.number(),
estimate: z.number(),

// Correct — bounded to realistic range
age: z.number().int().min(0).max(120),
estimate: z.number().int().min(0).max(10000),
wipLimit: z.number().int().min(1).max(1000),
```

## Date Fields

### Never use bare `z.string()` for dates

```typescript
// Wrong
dateFrom: z.string(),
dueDate: z.string().optional(),

// Correct — validates ISO 8601
dateFrom: z.iso.datetime(),
dueDate: z.iso.datetime().optional(),
```

## Array Fields

### Check uniqueness when duplicates are meaningless

```typescript
// Wrong — allows [id1, id1, id1]
tagIds: z.array(z.guid()),

// Correct — rejects duplicates
tagIds: z.array(z.guid()).refine(
  (arr) => new Set(arr).size === arr.length,
  { message: 'Duplicate values not allowed' },
),
```

## Enum Fields

### Import from Prisma, don't hardcode

```typescript
import { IssuePriority, IssueType } from '@prisma/client';

// Wrong — stale if schema changes
priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']),

// Correct — stays in sync with Prisma
priority: z.enum(IssuePriority),
type: z.enum(IssueType),
```

## Rich Text / JSON Fields

### Never use `z.any()` — define at least a minimal shape

```typescript
// Wrong — any object passes, no structure check
body: z.any(),
description: z.any(),

// Correct — validates Tiptap JSON structure
const tiptapContentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.object({
    type: z.string(),
  })).optional(),
}).passthrough();

body: tiptapContentSchema,
description: tiptapContentSchema.optional(),
```

## Query Parameters

### Always use `z.coerce` for numbers, never manual `parseInt()`

```typescript
// Wrong — string parsing in controller body
@Query('page') page?: string,
// ... then parseInt(page) in method

// Correct — Zod coerces at validation time
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export class PaginationQueryDto extends createZodDto(paginationSchema) {}
// in the controller:
@Query() query: PaginationQueryDto,
```

## Cross-Field Validation

Use `.refine()` or `.superRefine()` for business rules that span multiple fields:

```typescript
// Sprint dates
const createSprintSchema = z.object({
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
}).refine(
  (data) => new Date(data.startDate) < new Date(data.endDate),
  { message: 'End date must be after start date', path: ['endDate'] },
);

// Number config: min < max
const numberConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
}).refine(
  (data) => data.min == null || data.max == null || data.min < data.max,
  { message: 'min must be less than max', path: ['max'] },
);
```

## Checklist Before Committing a New DTO

- [ ] All string fields: `.trim()` on user text, `.toLowerCase()` on emails
- [ ] All date fields: `z.iso.datetime()`, not bare `z.string()`
- [ ] All number fields: `.min()` AND `.max()` with realistic bounds
- [ ] All arrays with IDs: uniqueness `.refine()`
- [ ] Cross-field logic: `.refine()` or `.superRefine()`
- [ ] No `z.any()` — define at least a minimal schema
- [ ] Enum values: `z.enum(PrismaEnum)`, not hardcoded strings
- [ ] Query params: `z.coerce.number()`, not manual `parseInt()`
