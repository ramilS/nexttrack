import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';
import type { CursorMeta } from '@repo/shared';
import type {
  Article,
  ArticleComment,
  TiptapDoc,
} from '@repo/shared/schemas';

const ARTICLE_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  updatedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { comments: true, children: true } },
} as const;

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof ARTICLE_INCLUDE }>;
type CommentRow = Prisma.ArticleCommentGetPayload<{
  include: typeof COMMENT_INCLUDE;
}>;

export interface ArticleTreeRow {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  publishedAt: Date | null;
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    title: row.title,
    slug: row.slug,
    content: (row.content as TiptapDoc | null) ?? null,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    commentsCount: row._count.comments,
    childrenCount: row._count.children,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toComment(row: CommentRow): ArticleComment {
  return {
    id: row.id,
    articleId: row.articleId,
    body: row.body as TiptapDoc,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ArticleCreateInput {
  projectId: string;
  title: string;
  content: TiptapDoc;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  createdById: string;
}

export interface ArticlePatch {
  title?: string;
  content?: TiptapDoc;
  slug?: string;
  updatedById: string;
}

export interface ArticleMovePatch {
  parentId: string | null;
  sortOrder?: number;
}

export interface ArticleCommentRecord {
  id: string;
  articleId: string;
  authorId: string;
}

@Injectable()
export class KnowledgeBaseRepository {
  constructor(private prisma: PrismaService) {}

  // ─── Articles ─────────────────────────────────────────────

  async findPage(
    projectId: string,
    options: { cursor?: string; pageSize: number },
  ): Promise<{ items: Article[]; meta: CursorMeta }> {
    const cursorArgs = buildSimpleCursorArgs({
      cursor: options.cursor,
      pageSize: options.pageSize,
    });
    const rows = await this.prisma.article.findMany({
      where: { projectId, archivedAt: null },
      include: ARTICLE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      ...cursorArgs,
    });

    const page = buildSimpleCursorResult(rows, options.pageSize);
    return { items: page.items.map(toArticle), meta: page.meta };
  }

  async findTreeRows(projectId: string): Promise<ArticleTreeRow[]> {
    return this.prisma.article.findMany({
      where: { projectId, archivedAt: null },
      select: {
        id: true,
        parentId: true,
        title: true,
        slug: true,
        sortOrder: true,
        publishedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async findBySlug(projectId: string, slug: string): Promise<Article | null> {
    const row = await this.prisma.article.findFirst({
      where: { projectId, slug, archivedAt: null },
      include: ARTICLE_INCLUDE,
    });
    return row ? toArticle(row) : null;
  }

  async findById(projectId: string, articleId: string): Promise<Article | null> {
    const row = await this.prisma.article.findFirst({
      where: { id: articleId, projectId },
      include: ARTICLE_INCLUDE,
    });
    return row ? toArticle(row) : null;
  }

  async existsInProject(projectId: string, articleId: string): Promise<boolean> {
    const row = await this.prisma.article.findFirst({
      where: { id: articleId, projectId },
      select: { id: true },
    });
    return row !== null;
  }

  /** Used by publish/archive to check current state. */
  async findStatusInProject(
    projectId: string,
    articleId: string,
  ): Promise<{ publishedAt: Date | null; archivedAt: Date | null } | null> {
    const row = await this.prisma.article.findFirst({
      where: { id: articleId, projectId },
      select: { publishedAt: true, archivedAt: true },
    });
    return row;
  }

  /**
   * The ancestor chain of an article (itself first, then parent, …) in a
   * single recursive CTE. Capped at `maxDepth` so corrupt data with a cycle
   * cannot loop forever; project-scoped on the anchor row.
   */
  async findAncestorChain(
    projectId: string,
    articleId: string,
    maxDepth: number,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, 1 AS depth
        FROM articles
        WHERE id = ${articleId} AND project_id = ${projectId}
        UNION ALL
        SELECT a.id, a.parent_id, anc.depth + 1
        FROM articles a
        JOIN ancestors anc ON a.id = anc.parent_id
        WHERE anc.depth < ${maxDepth}
      )
      SELECT id FROM ancestors ORDER BY depth
    `;
    return rows.map((r) => r.id);
  }

  /** Slug-uniqueness check; returns true if `slug` is free (or taken only by `excludeId`). */
  async isSlugFree(
    projectId: string,
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    const row = await this.prisma.article.findFirst({
      where: {
        projectId,
        slug,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    return row === null;
  }

  async findSlugsStartingWith(
    projectId: string,
    prefix: string,
  ): Promise<string[]> {
    const rows = await this.prisma.article.findMany({
      where: { projectId, slug: { startsWith: prefix } },
      select: { slug: true },
    });
    return rows.map((r) => r.slug);
  }

  async maxSiblingOrdinal(
    projectId: string,
    parentId: string | null,
  ): Promise<number> {
    const result = await this.prisma.article.aggregate({
      where: { projectId, parentId },
      _max: { sortOrder: true },
    });
    return result._max.sortOrder ?? -1;
  }

  async create(input: ArticleCreateInput): Promise<Article> {
    const row = await this.prisma.article.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        content: asJson(input.content),
        slug: input.slug,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        createdById: input.createdById,
      },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(row);
  }

  async update(articleId: string, patch: ArticlePatch): Promise<Article> {
    const data: Prisma.ArticleUpdateInput = { updatedBy: { connect: { id: patch.updatedById } } };
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.content !== undefined) data.content = asJson(patch.content);
    if (patch.slug !== undefined) data.slug = patch.slug;

    const row = await this.prisma.article.update({
      where: { id: articleId },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(row);
  }

  async move(articleId: string, patch: ArticleMovePatch): Promise<Article> {
    const data: Prisma.ArticleUpdateInput = {
      parent: patch.parentId
        ? { connect: { id: patch.parentId } }
        : { disconnect: true },
    };
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;

    const row = await this.prisma.article.update({
      where: { id: articleId },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(row);
  }

  async setPublishedAt(articleId: string, when: Date): Promise<Article> {
    const row = await this.prisma.article.update({
      where: { id: articleId },
      data: { publishedAt: when },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(row);
  }

  async setArchivedAt(articleId: string, when: Date): Promise<Article> {
    const row = await this.prisma.article.update({
      where: { id: articleId },
      data: { archivedAt: when },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(row);
  }

  async delete(articleId: string): Promise<void> {
    await this.prisma.article.delete({ where: { id: articleId } });
  }

  // ─── Comments ─────────────────────────────────────────────

  async findCommentsPage(
    articleId: string,
    options: { cursor?: string; pageSize: number },
  ): Promise<{ items: ArticleComment[]; meta: CursorMeta }> {
    const cursorArgs = buildSimpleCursorArgs({
      cursor: options.cursor,
      pageSize: options.pageSize,
    });
    const rows = await this.prisma.articleComment.findMany({
      where: { articleId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
      ...cursorArgs,
    });

    const page = buildSimpleCursorResult(rows, options.pageSize);
    return { items: page.items.map(toComment), meta: page.meta };
  }

  async createComment(
    articleId: string,
    authorId: string,
    body: TiptapDoc,
  ): Promise<ArticleComment> {
    const row = await this.prisma.articleComment.create({
      data: { articleId, authorId, body: asJson(body) },
      include: COMMENT_INCLUDE,
    });
    return toComment(row);
  }

  async findCommentRecord(commentId: string): Promise<ArticleCommentRecord | null> {
    const row = await this.prisma.articleComment.findUnique({
      where: { id: commentId },
      select: { id: true, articleId: true, authorId: true },
    });
    return row;
  }

  async updateComment(
    commentId: string,
    body: TiptapDoc,
  ): Promise<ArticleComment> {
    const row = await this.prisma.articleComment.update({
      where: { id: commentId },
      data: { body: asJson(body) },
      include: COMMENT_INCLUDE,
    });
    return toComment(row);
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.prisma.articleComment.delete({ where: { id: commentId } });
  }
}
