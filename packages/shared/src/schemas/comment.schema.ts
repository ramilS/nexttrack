import { z } from 'zod';
import { tiptapContentSchema, type TiptapDoc } from './tiptap.schema';
import { userSummarySchema } from './common.schema';

// ─── Request schemas ─────────────────────────────────────────

export const createCommentSchema = z.object({
  body: tiptapContentSchema,
  parentId: z.guid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: tiptapContentSchema,
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const listCommentsQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListCommentsQuery = z.input<typeof listCommentsQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

// Recursive type — define via z.lazy + manual interface.
// `body` is a Tiptap JSON document or `null` when soft-deleted.
export interface Comment {
  id: string;
  issueId: string;
  parentId: string | null;
  author: z.infer<typeof userSummarySchema>;
  /** Tiptap doc, or `null` when the comment is soft-deleted. */
  body?: TiptapDoc | null;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  replies: Comment[];
}

export const commentSchema: z.ZodType<Comment> = z.lazy(() =>
  z.object({
    id: z.guid(),
    issueId: z.guid(),
    parentId: z.guid().nullable(),
    author: userSummarySchema,
    body: tiptapContentSchema.nullable(),
    isDeleted: z.boolean(),
    editedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    replies: z.array(commentSchema),
  }),
);
