import { z } from 'zod';

/**
 * Response schemas for the admin migration API. The endpoints return ad-hoc
 * envelopes ({ data, existed }, { success }, a stats object) that the global
 * TransformInterceptor then wraps again into { data, meta } — these schemas
 * describe the INNER payload (the handler's raw return). Date columns are
 * mapped to ISO strings in the service so the runtime shape matches.
 *
 * Migration is an admin-only import tool consumed by a migration script, not
 * the web app, so these schemas stay local to the module (like its request
 * schemas in this dto/ folder) rather than going to @repo/shared.
 */

export const migrationUserSchema = z.object({
  id: z.guid(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  isBlocked: z.boolean(),
  blockedAt: z.iso.datetime().nullable(),
  blockReason: z.string().nullable(),
  deletedAt: z.iso.datetime().nullable(),
  ytId: z.string().nullable(),
  migratedFrom: z.string().nullable(),
  hasPassword: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MigrationUser = z.infer<typeof migrationUserSchema>;

export const migrationIssueSchema = z.object({
  id: z.guid(),
  number: z.number().int(),
  title: z.string(),
  projectId: z.guid(),
  ytId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MigrationIssue = z.infer<typeof migrationIssueSchema>;

export const migrationUserResultSchema = z.object({
  data: migrationUserSchema,
  existed: z.boolean(),
});

export const migrationUserLookupSchema = z.object({
  data: migrationUserSchema.nullable(),
});

export const migrationIssueResultSchema = z.object({
  data: migrationIssueSchema,
  existed: z.boolean(),
});

export const migrationIssueLookupSchema = z.object({
  data: migrationIssueSchema.nullable(),
});

export const migrationCommentResultSchema = z.object({
  data: z.object({ id: z.guid() }),
});

export const migrationSuccessSchema = z.object({
  success: z.boolean(),
});

export const migrationStatusesSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const migrationMembersResultSchema = z.object({
  added: z.number().int().nonnegative(),
});

export const migrationTagResultSchema = z.object({
  data: z.object({ id: z.guid(), name: z.string() }),
  existed: z.boolean(),
});

export const migrationTagLinkResultSchema = z.object({
  linked: z.number().int().nonnegative(),
});

export const migrationTimeLogsResultSchema = z.object({
  created: z.number().int().nonnegative(),
});

export const migrationLinkResultSchema = z.object({
  data: z.object({ id: z.guid() }).nullable(),
  existed: z.boolean(),
});

export const migrationCustomFieldsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      options: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});

export const migrationStatsSchema = z.object({
  projectKey: z.string(),
  projectId: z.guid(),
  counts: z.object({
    issues: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(),
    timeLogs: z.number().int().nonnegative(),
  }),
});
