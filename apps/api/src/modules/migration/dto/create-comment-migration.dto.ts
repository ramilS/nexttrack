import { z } from 'zod';
import { tiptapContentSchema } from '@repo/shared/schemas';

export const createCommentMigrationSchema = z.object({
  authorId: z.guid(),
  body: tiptapContentSchema,
  originalCreatedAt: z.iso.datetime().optional(),
});

export type CreateCommentMigrationDto = z.infer<typeof createCommentMigrationSchema>;
