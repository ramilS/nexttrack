import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination';
import { userSummarySchema, uniqueUuidArray } from './common.schema';
import { statusCategorySchema } from './project.schema';
import { tiptapContentSchema } from './tiptap.schema';

export const ISSUE_TITLE_MAX = 500;
export const ISSUE_ESTIMATE_MIN = 1;
export const ISSUE_ESTIMATE_MAX = 9999;

export const ISSUE_TYPES = ['TASK', 'BUG', 'STORY', 'EPIC', 'FEATURE'] as const;
export const issueTypeSchema = z.enum(ISSUE_TYPES);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const ISSUE_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const issuePrioritySchema = z.enum(ISSUE_PRIORITIES);
export type IssuePriority = z.infer<typeof issuePrioritySchema>;

const fieldValueInputSchema = z.object({
  fieldId: z.guid(),
  value: z.unknown(),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(ISSUE_TITLE_MAX),
  description: tiptapContentSchema.optional(),
  type: issueTypeSchema.default('TASK'),
  priority: issuePrioritySchema.default('MEDIUM'),
  statusId: z.guid().optional(),
  assigneeId: z.guid().optional(),
  parentId: z.guid().optional(),
  sprintId: z.guid().optional(),
  dueDate: z.iso.datetime().optional(),
  estimate: z.number().int().min(ISSUE_ESTIMATE_MIN).max(ISSUE_ESTIMATE_MAX).optional(),
  tagIds: uniqueUuidArray().optional(),
  fieldValues: z
    .array(fieldValueInputSchema)
    .refine((arr) => new Set(arr.map((f) => f.fieldId)).size === arr.length, {
      message: 'Duplicate fieldId values not allowed',
    })
    .optional(),
});
export type CreateIssueInput = z.input<typeof createIssueSchema>;
export type CreateIssueParsed = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1).max(ISSUE_TITLE_MAX).optional(),
  description: tiptapContentSchema.nullable().optional(),
  type: issueTypeSchema.optional(),
  priority: issuePrioritySchema.optional(),
  statusId: z.guid().optional(),
  assigneeId: z.guid().nullable().optional(),
  parentId: z.guid().nullable().optional(),
  startDate: z.iso.datetime().nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  estimate: z
    .number()
    .int()
    .min(ISSUE_ESTIMATE_MIN)
    .max(ISSUE_ESTIMATE_MAX)
    .nullable()
    .optional(),
  sprintId: z.guid().nullable().optional(),
  tagIds: uniqueUuidArray().optional(),
  version: z.number().int().min(1).optional(),
});
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export const bulkUpdateIssuesSchema = z.object({
  issueIds: uniqueUuidArray({ min: 1, max: 100 }),
  update: z.object({
    statusId: z.guid().optional(),
    assigneeId: z.guid().nullable().optional(),
    priority: issuePrioritySchema.optional(),
    tagIds: uniqueUuidArray().optional(),
  }),
});
export type BulkUpdateIssuesInput = z.infer<typeof bulkUpdateIssuesSchema>;

const toArray = (v: unknown): string[] | undefined => {
  if (v == null || v === '') return undefined;
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
};

export const ISSUE_SORT_FIELDS = [
  'number',
  'title',
  'priority',
  'createdAt',
  'updatedAt',
  'dueDate',
] as const;

export const fieldFilterOperatorSchema = z.enum([
  'eq',
  'in',
  'gte',
  'lte',
  'between',
  'is_empty',
  'is_not_empty',
]);

const fieldFilterSchema = z.object({
  fieldId: z.string(),
  operator: fieldFilterOperatorSchema,
  value: z.unknown().optional(),
});
export type FieldFilter = z.infer<typeof fieldFilterSchema>;

export const listIssuesQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(ISSUE_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  type: z.preprocess(toArray, z.array(issueTypeSchema).optional()),
  priority: z.preprocess(toArray, z.array(issuePrioritySchema).optional()),
  statusId: z.preprocess(toArray, z.array(z.string()).optional()),
  assigneeId: z.preprocess(toArray, z.array(z.string()).optional()),
  reporterId: z.preprocess(toArray, z.array(z.string()).optional()),
  tagIds: z.preprocess(toArray, z.array(z.string()).optional()),
  parentId: z.string().optional(),
  dueDateFrom: z.iso.datetime().optional(),
  dueDateTo: z.iso.datetime().optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
  hasEstimate: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional(),
  withDeleted: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional(),
  fieldFilters: z
    .union([
      z.array(fieldFilterSchema),
      z
        .string()
        .transform((v) => {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        })
        .pipe(z.array(fieldFilterSchema).optional()),
    ])
    .optional(),
});
export type ListIssuesQuery = z.input<typeof listIssuesQuerySchema>;
export type ListIssuesQueryParsed = z.infer<typeof listIssuesQuerySchema>;

// ─── Response shapes ─────────────────────────────────────────

export const issueStatusSchema = z.object({
  id: z.guid(),
  name: z.string(),
  color: z.string(),
  category: statusCategorySchema,
});
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueTagSchema = z.object({
  id: z.guid(),
  name: z.string(),
  color: z.string(),
});
export type IssueTag = z.infer<typeof issueTagSchema>;

export const issueProjectRefSchema = z.object({
  id: z.guid(),
  key: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});
export type IssueProjectRef = z.infer<typeof issueProjectRefSchema>;

export const issueListItemSchema = z.object({
  id: z.guid(),
  number: z.number().int().positive(),
  title: z.string(),
  type: issueTypeSchema,
  priority: issuePrioritySchema,
  status: issueStatusSchema.nullable(),
  assignee: userSummarySchema.nullable(),
  reporter: userSummarySchema,
  tags: z.array(issueTagSchema),
  estimate: z.number().int().nullable(),
  spent: z.number().int().nonnegative(),
  dueDate: z.iso.datetime().nullable(),
  commentsCount: z.number().int().nonnegative(),
  childrenCount: z.number().int().nonnegative(),
  sprintId: z.guid().nullable(),
  sprintName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().min(1),
});
export type IssueListItem = z.infer<typeof issueListItemSchema>;

/**
 * Light reference to an issue — used in `IssueDetail.parent` and embedded in
 * any context that only needs the issue identity + status. Backend builds via
 * `toIssueRef`.
 */
export const issueRefSchema = z.object({
  id: z.guid(),
  number: z.number().int().positive(),
  title: z.string(),
  type: issueTypeSchema,
  priority: issuePrioritySchema,
  status: issueStatusSchema.nullable(),
});
export type IssueRef = z.infer<typeof issueRefSchema>;

/**
 * Sub-issue row embedded in `IssueDetail.children`. Adds the fields shown in
 * the sub-issues table (assignee, counts) without the full `IssueListItem`
 * payload — the detail endpoint doesn't load tags/reporter/sprint for kids.
 */
export const issueChildRefSchema = issueRefSchema.extend({
  assignee: userSummarySchema.nullable(),
  commentsCount: z.number().int().nonnegative(),
  childrenCount: z.number().int().nonnegative(),
});
export type IssueChildRef = z.infer<typeof issueChildRefSchema>;

export const issueDetailSchema = issueListItemSchema.extend({
  description: tiptapContentSchema.nullable(),
  parent: issueRefSchema.nullable(),
  children: z.array(issueChildRefSchema),
  watchers: z.array(userSummarySchema),
  isWatching: z.boolean(),
  project: issueProjectRefSchema,
});
export type IssueDetail = z.infer<typeof issueDetailSchema>;

/**
 * Result of a bulk issue update. `updated` is the count of issues actually
 * patched; `failed` lists the request ids that didn't resolve to an issue in
 * this project (skipped, not errored).
 */
export const bulkUpdateResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  failed: z.array(z.guid()),
});
export type BulkUpdateResult = z.infer<typeof bulkUpdateResultSchema>;

/**
 * Activity-feed entry for an issue (GET .../activities). `type` is a Prisma
 * ActivityType value (kept as a string — shared stays Prisma-free); `payload`
 * shape varies by type. `createdAt` mapped to ISO at the service boundary.
 */
export const activitySchema = z.object({
  id: z.guid(),
  issueId: z.guid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  actor: userSummarySchema,
});
export type Activity = z.infer<typeof activitySchema>;
