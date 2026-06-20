import { z } from 'zod';

export const TAG_NAME_MAX = 50;

export const TAG_COLOR_NAMES = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'purple',
  'pink',
  'gray',
] as const;

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export const tagColorSchema = z.string().refine(
  (val) => (TAG_COLOR_NAMES as readonly string[]).includes(val) || hexColorPattern.test(val),
  { message: 'Color must be a named color (red, blue, etc.) or hex (#ff0000)' },
);
export type TagColor = z.infer<typeof tagColorSchema>;

// ─── Request schemas ─────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(TAG_NAME_MAX),
  color: tagColorSchema,
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(TAG_NAME_MAX).optional(),
  color: tagColorSchema.optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const addIssueTagSchema = z.object({
  tagId: z.guid(),
});
export type AddIssueTagInput = z.infer<typeof addIssueTagSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const tagSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.iso.datetime(),
});
export type Tag = z.infer<typeof tagSchema>;
