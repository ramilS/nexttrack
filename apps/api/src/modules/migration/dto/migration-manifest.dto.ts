import { MigrationEntityStatus } from '@prisma/client';
import { z } from 'zod';

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
      code: z.string().trim().min(1).max(100),
      message: z.string().trim().min(1).max(10_000),
      details: z.record(z.string(), z.unknown()).optional(),
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
