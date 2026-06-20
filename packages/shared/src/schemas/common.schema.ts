import { z } from 'zod';

/**
 * Array of unique UUIDs — duplicates would hit a DB unique constraint (P2002 →
 * 500) instead of failing validation. Bounds are options because `.refine()`
 * returns a `ZodEffects` with no `.min()/.max()` to chain.
 */
export function uniqueUuidArray(opts: { min?: number; max?: number } = {}) {
  let arr = z.array(z.guid());
  if (opts.min !== undefined) arr = arr.min(opts.min);
  if (opts.max !== undefined) arr = arr.max(opts.max);
  return arr.refine((values) => new Set(values).size === values.length, {
    message: 'Duplicate values not allowed',
  });
}

export const userSummarySchema = z.object({
  id: z.guid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.string().nullable(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userRefSchema = z.object({
  id: z.guid(),
  name: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const paginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Metadata returned with cursor-paginated (keyset) lists. */
export const cursorMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  pageSize: z.number().int().positive(),
  hasNextPage: z.boolean(),
});
export type CursorMeta = z.infer<typeof cursorMetaSchema>;
