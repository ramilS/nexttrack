import { MigrationEntityStatus } from '@prisma/client';
import {
  PROJECT_KEY_MAX,
  PROJECT_KEY_MIN,
  PROJECT_KEY_REGEX,
} from '@repo/shared/schemas';
import { z } from 'zod';
import { containsMigrationSecret } from '../migration-json';

export const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ERROR_DETAILS_MAX_BYTES = 32_768;
const ERROR_DETAILS_MAX_DEPTH = 8;

function jsonDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.reduce(
    (max, child) => Math.max(max, jsonDepth(child, depth + 1)),
    depth,
  );
}

const errorDetailsSchema = z.record(z.string(), z.unknown()).superRefine(
  (value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > ERROR_DETAILS_MAX_BYTES) {
      ctx.addIssue({ code: 'custom', message: 'Error details are too large' });
    }
    if (jsonDepth(value) > ERROR_DETAILS_MAX_DEPTH) {
      ctx.addIssue({ code: 'custom', message: 'Error details are too deeply nested' });
    }
  },
);

const safeString = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim())
    .refine(
      (value) =>
        ![...value].some((character) => {
          const codePoint = character.codePointAt(0)!;
          return codePoint <= 0x1f || codePoint === 0x7f;
        }),
    )
    .refine((value) => !containsMigrationSecret(value));

const canonicalBaseUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '') === value;
  });

const migrationProjectKeySchema = z
  .string()
  .min(PROJECT_KEY_MIN)
  .max(PROJECT_KEY_MAX)
  .regex(PROJECT_KEY_REGEX);

export const safeMigrationRunConfigSchema = z
  .object({
    sourceUrl: canonicalBaseUrlSchema,
    targetUrl: canonicalBaseUrlSchema,
    projects: z.array(migrationProjectKeySchema).max(1_000),
    allProjects: z.boolean(),
    withAttachments: z.boolean(),
    withTimeTracking: z.boolean(),
    withBoards: z.boolean(),
    withClosedIssues: z.boolean(),
    estimateField: safeString(100).nullable(),
    dryRun: z.boolean(),
    concurrency: z.number().int().min(1).max(100),
    batchSize: z.number().int().min(1).max(500),
    rateLimit: z.number().int().min(1).max(1_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const canonicalProjects = [...new Set(value.projects)].sort();
    if (JSON.stringify(value.projects) !== JSON.stringify(canonicalProjects)) {
      ctx.addIssue({ code: 'custom', message: 'Projects must be canonical' });
    }
    if (!value.allProjects && value.projects.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Projects are required' });
    }
  });

export const startMigrationRunSchema = z.object({
  sourceSystem: z.literal('youtrack-cloud'),
  sourceTenant: z.string().trim().min(1).max(255),
  // The service owns URL parsing so malformed/component-bearing URLs receive
  // the stable MIGRATION_RUN_URL_INVALID machine code rather than a generic
  // DTO validation response.
  sourceUrl: z.string().trim().min(1).max(2_048),
  targetUrl: z.string().trim().min(1).max(2_048),
  config: safeMigrationRunConfigSchema,
  configHash: checksumSchema,
  specVersion: z.literal('2026-07-14'),
  exclusionVersion: z.literal('2026-07-14'),
}).strict().superRefine((value, ctx) => {
  const canonical = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  };
  const canonicalSourceUrl = canonical(value.sourceUrl);
  if (canonicalSourceUrl !== null && canonicalSourceUrl !== value.config.sourceUrl) {
    ctx.addIssue({ code: 'custom', message: 'Source URL mismatch' });
  }
  const canonicalTargetUrl = canonical(value.targetUrl);
  if (canonicalTargetUrl !== null && canonicalTargetUrl !== value.config.targetUrl) {
    ctx.addIssue({ code: 'custom', message: 'Target URL mismatch' });
  }
});
export type StartMigrationRun = z.infer<typeof startMigrationRunSchema>;

export const discoverMigrationEntitiesSchema = z.object({
  entities: z
    .array(
      z.object({
        entityType: z.string().trim().min(1).max(100),
        sourceId: z.string().trim().min(1).max(500),
        sourceChecksum: checksumSchema,
      }),
    )
    .min(1)
    .max(500),
});
export type DiscoverMigrationEntities = z.infer<
  typeof discoverMigrationEntitiesSchema
>;

export const transitionMigrationEntitySchema = z.object({
  entityType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(500),
  sourceChecksum: checksumSchema,
  status: z.enum(MigrationEntityStatus),
  targetId: z.string().trim().min(1).max(500).optional(),
  error: z
    .object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/),
      message: z.string().trim().min(1).max(10_000),
      details: errorDetailsSchema.optional(),
    })
    .optional(),
});
export type TransitionMigrationEntity = z.infer<
  typeof transitionMigrationEntitySchema
>;

export const listMigrationEntitiesQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(100).optional(),
  status: z.enum(MigrationEntityStatus).optional(),
  cursor: z.guid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListMigrationEntitiesQuery = z.infer<
  typeof listMigrationEntitiesQuerySchema
>;
