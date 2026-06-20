import { z } from 'zod';

export const VERSION_NAME_MAX = 100;
export const VERSION_DESCRIPTION_MAX = 1000;

export const VERSION_STATUSES = ['UNRELEASED', 'RELEASED', 'ARCHIVED'] as const;
export const versionStatusSchema = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

// ─── Request schemas ─────────────────────────────────────────

export const createVersionSchema = z.object({
  name: z.string().trim().min(1).max(VERSION_NAME_MAX),
  description: z.string().max(VERSION_DESCRIPTION_MAX).optional(),
  status: versionStatusSchema.optional(),
  releaseDate: z.iso.datetime().optional(),
});
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

export const updateVersionSchema = z.object({
  name: z.string().trim().min(1).max(VERSION_NAME_MAX).optional(),
  description: z.string().max(VERSION_DESCRIPTION_MAX).nullable().optional(),
  releaseDate: z.iso.datetime().nullable().optional(),
});
export type UpdateVersionInput = z.infer<typeof updateVersionSchema>;

export const releaseVersionSchema = z.object({
  releaseDate: z.iso.datetime().optional(),
});
export type ReleaseVersionInput = z.infer<typeof releaseVersionSchema>;

export const reorderVersionsSchema = z.object({
  ordinals: z
    .array(
      z.object({
        id: z.guid(),
        ordinal: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type ReorderVersionsInput = z.infer<typeof reorderVersionsSchema>;

export const versionsQuerySchema = z.object({
  status: versionStatusSchema.optional(),
});
export type VersionsQuery = z.infer<typeof versionsQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

export const versionSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  status: versionStatusSchema,
  releaseDate: z.iso.datetime().nullable(),
  ordinal: z.number().int().nonnegative(),
});
export type Version = z.infer<typeof versionSchema>;
