import type { Prisma } from '@prisma/client';

/**
 * Cast an application-level JSON value (object, array, or primitive) to
 * Prisma's `InputJsonValue` for use in `create.data` / `update.data` on
 * JSON columns.
 *
 * Why this exists: Prisma's `InputJsonValue` is a structural union that
 * TypeScript can't narrow our `Record<string, unknown>` / `T[]` shapes to,
 * even when they would be valid JSON at runtime. Without this helper every
 * write to a JSON column needs an inline `as any`. With it, the unsafe
 * boundary is named ("this is going into a JSON column") and centralized.
 *
 * The cast is sound as long as the caller's value is plain JSON-serializable
 * data — no Dates, BigInts, functions, undefined, or Symbols. Validate at
 * the input boundary (Zod) so unsafe values never reach here.
 */
export function asJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
