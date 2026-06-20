import { z } from 'zod';
import { userSummarySchema } from './common.schema';
import { tiptapContentSchema, type TiptapDoc } from './tiptap.schema';

export const ARTICLE_TITLE_MAX = 500;
export const ARTICLE_SLUG_MAX = 200;
export const ARTICLE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .min(1)
  .max(ARTICLE_SLUG_MAX)
  .regex(ARTICLE_SLUG_REGEX, 'Slug must be lowercase with hyphens');

// ─── Request schemas ─────────────────────────────────────────

export const createArticleSchema = z.object({
  title: z.string().trim().min(1).max(ARTICLE_TITLE_MAX),
  content: tiptapContentSchema.optional().default({ type: 'doc' }),
  parentId: z.guid().optional(),
  slug: slugSchema.optional(),
});
export type CreateArticleInput = z.input<typeof createArticleSchema>;
export type CreateArticleParsed = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  title: z.string().trim().min(1).max(ARTICLE_TITLE_MAX).optional(),
  content: tiptapContentSchema.optional(),
  slug: slugSchema.optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const moveArticleSchema = z.object({
  parentId: z.guid().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});
export type MoveArticleInput = z.infer<typeof moveArticleSchema>;

export const createArticleCommentSchema = z.object({
  body: tiptapContentSchema,
});
export type CreateArticleCommentInput = z.infer<typeof createArticleCommentSchema>;

export const updateArticleCommentSchema = z.object({
  body: tiptapContentSchema,
});
export type UpdateArticleCommentInput = z.infer<typeof updateArticleCommentSchema>;

// ─── Response schemas ─────────────────────────────────────────

/** Recursive tree shape used by /tree and search endpoints. */
export interface ArticleTreeNode {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  publishedAt: string | null;
  children: ArticleTreeNode[];
}

export const articleTreeNodeSchema: z.ZodType<ArticleTreeNode> = z.lazy(() =>
  z.object({
    id: z.guid(),
    parentId: z.guid().nullable(),
    title: z.string(),
    slug: z.string(),
    sortOrder: z.number().int(),
    publishedAt: z.iso.datetime().nullable(),
    children: z.array(articleTreeNodeSchema),
  }),
);

export interface Article {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  slug: string;
  content: TiptapDoc | null;
  sortOrder: number;
  publishedAt: string | null;
  archivedAt: string | null;
  createdBy: z.infer<typeof userSummarySchema>;
  updatedBy: z.infer<typeof userSummarySchema> | null;
  commentsCount: number;
  childrenCount: number;
  createdAt: string;
  updatedAt: string;
}

export const articleSchema: z.ZodType<Article> = z.object({
  id: z.guid(),
  projectId: z.guid(),
  parentId: z.guid().nullable(),
  title: z.string(),
  slug: z.string(),
  // tiptapContentSchema is the loose doc validator (z.any().refine); the
  // explicit z.ZodType<Article> annotation pins content's output to
  // TiptapDoc | null. z.custom<TiptapDoc> would do the same but is
  // unrepresentable in JSON Schema (breaks OpenAPI generation).
  content: tiptapContentSchema.nullable(),
  sortOrder: z.number().int(),
  publishedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdBy: userSummarySchema,
  updatedBy: userSummarySchema.nullable(),
  commentsCount: z.number().int().nonnegative(),
  childrenCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const articleCommentSchema = z.object({
  id: z.guid(),
  articleId: z.guid(),
  body: tiptapContentSchema,
  author: userSummarySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ArticleComment = z.infer<typeof articleCommentSchema>;
