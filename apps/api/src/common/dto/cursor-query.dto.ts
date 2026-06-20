import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@repo/shared/pagination';

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type CursorQueryDto = z.infer<typeof cursorQuerySchema>;
