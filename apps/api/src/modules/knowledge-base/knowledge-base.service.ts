import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { AppLogger } from '@/common/logging/app-logger';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  Article,
  ArticleComment,
  ArticleTreeNode,
  CreateArticleParsed,
  CreateArticleCommentInput,
  MoveArticleInput,
  UpdateArticleCommentInput,
  UpdateArticleInput,
} from '@repo/shared/schemas';
import type { CursorMeta } from '@repo/shared';
import {
  ArticleTreeRow,
  KnowledgeBaseRepository,
} from './knowledge-base.repository';

const DEFAULT_PAGE_SIZE = 20;
// Hard cap for the ancestor-chain CTE — far above any realistic article tree.
const MAX_ARTICLE_TREE_DEPTH = 100;

function buildTree(rows: ArticleTreeRow[], parentId: string | null): ArticleTreeNode[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .map((r) => ({
      id: r.id,
      parentId: r.parentId,
      title: r.title,
      slug: r.slug,
      sortOrder: r.sortOrder,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      children: buildTree(rows, r.id),
    }));
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new AppLogger(KnowledgeBaseService.name);

  constructor(private repo: KnowledgeBaseRepository) {}

  async findAll(
    projectId: string,
    options?: { cursor?: string; pageSize?: number },
  ): Promise<{ items: Article[]; meta: CursorMeta }> {
    return this.repo.findPage(projectId, {
      cursor: options?.cursor,
      pageSize: options?.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  async getTree(projectId: string): Promise<ArticleTreeNode[]> {
    const rows = await this.repo.findTreeRows(projectId);
    return buildTree(rows, null);
  }

  async findBySlug(projectId: string, slug: string): Promise<Article> {
    const article = await this.repo.findBySlug(projectId, slug);
    if (!article) throw this.articleNotFound();
    return article;
  }

  async create(
    projectId: string,
    dto: CreateArticleParsed,
    userId: string,
  ): Promise<Article> {
    let slug: string;
    if (dto.slug) {
      await this.assertSlugUnique(projectId, dto.slug);
      slug = dto.slug;
    } else {
      slug = await this.resolveSlug(projectId, this.generateSlug(dto.title));
    }

    if (dto.parentId) {
      await this.assertArticleExists(projectId, dto.parentId);
    }

    const maxOrder = await this.repo.maxSiblingOrdinal(projectId, dto.parentId ?? null);

    const article = await this.repo.create({
      projectId,
      title: dto.title,
      content: dto.content,
      slug,
      parentId: dto.parentId ?? null,
      sortOrder: maxOrder + 1,
      createdById: userId,
    });

    this.logger.log('Article created', {
      articleId: article.id,
      projectId,
      slug,
      parentId: dto.parentId ?? null,
    });

    return article;
  }

  async update(
    projectId: string,
    articleId: string,
    dto: UpdateArticleInput,
    userId: string,
  ): Promise<Article> {
    await this.assertArticleExists(projectId, articleId);

    if (dto.slug) {
      await this.assertSlugUnique(projectId, dto.slug, articleId);
    }

    this.logger.log('Updating article', {
      articleId,
      projectId,
      fields: Object.keys(dto),
      slug: dto.slug,
    });

    return this.repo.update(articleId, {
      title: dto.title,
      content: dto.content,
      slug: dto.slug,
      updatedById: userId,
    });
  }

  /**
   * Apply an AI-generated documentation draft: update the target article, or
   * create a new one when `targetArticleId` is null. Routed through the normal
   * create/update path so all article invariants (slug uniqueness/generation,
   * existence checks) are enforced. Used by the ai-docs module on doc-issue Done.
   */
  async applyAiDraft(
    projectId: string,
    targetArticleId: string | null,
    title: string,
    content: CreateArticleParsed['content'],
    userId: string,
  ): Promise<Article> {
    if (targetArticleId) {
      return this.update(projectId, targetArticleId, { title, content }, userId);
    }
    return this.create(projectId, { title, content }, userId);
  }

  async remove(projectId: string, articleId: string): Promise<void> {
    await this.assertArticleExists(projectId, articleId);
    await this.repo.delete(articleId);
    this.logger.log('Article deleted', { articleId, projectId });
  }

  async move(
    projectId: string,
    articleId: string,
    dto: MoveArticleInput,
  ): Promise<Article> {
    await this.assertArticleExists(projectId, articleId);

    if (dto.parentId) {
      if (dto.parentId === articleId) {
        throw new ValidationError(ErrorCode.ARTICLE_CYCLE, 'Cannot move article under itself');
      }
      await this.assertArticleExists(projectId, dto.parentId);
      await this.assertNotDescendant(projectId, articleId, dto.parentId);
    }

    this.logger.log('Article moved', {
      articleId,
      projectId,
      parentId: dto.parentId ?? null,
      sortOrder: dto.sortOrder,
    });

    return this.repo.move(articleId, {
      parentId: dto.parentId ?? null,
      sortOrder: dto.sortOrder,
    });
  }

  async publish(projectId: string, articleId: string): Promise<Article> {
    const status = await this.repo.findStatusInProject(projectId, articleId);
    if (!status) throw this.articleNotFound();

    if (status.publishedAt) {
      throw new ConflictError(
        ErrorCode.ARTICLE_ALREADY_PUBLISHED,
        'Article is already published',
      );
    }

    const article = await this.repo.setPublishedAt(articleId, new Date());
    this.logger.log('Article published', { articleId, projectId });
    return article;
  }

  async archive(projectId: string, articleId: string): Promise<Article> {
    const status = await this.repo.findStatusInProject(projectId, articleId);
    if (!status) throw this.articleNotFound();

    if (status.archivedAt) {
      throw new ConflictError(ErrorCode.ARTICLE_ALREADY_ARCHIVED, 'Article is already archived');
    }

    const article = await this.repo.setArchivedAt(articleId, new Date());
    this.logger.log('Article archived', { articleId, projectId });
    return article;
  }

  // ─── Comments ─────────────────────────────────────────────

  async findComments(
    articleId: string,
    options?: { cursor?: string; pageSize?: number },
  ): Promise<{ items: ArticleComment[]; meta: CursorMeta }> {
    return this.repo.findCommentsPage(articleId, {
      cursor: options?.cursor,
      pageSize: options?.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  }

  async addComment(
    articleId: string,
    dto: CreateArticleCommentInput,
    userId: string,
  ): Promise<ArticleComment> {
    const comment = await this.repo.createComment(articleId, userId, dto.body);
    this.logger.log('Article comment added', {
      commentId: comment.id,
      articleId,
    });
    return comment;
  }

  async updateComment(
    commentId: string,
    dto: UpdateArticleCommentInput,
    userId: string,
  ): Promise<ArticleComment> {
    const comment = await this.repo.findCommentRecord(commentId);
    if (!comment) {
      throw new NotFoundError(ErrorCode.ARTICLE_COMMENT_NOT_FOUND, 'Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ValidationError(
        ErrorCode.COMMENT_NOT_AUTHOR,
        'Only the author can edit this comment',
      );
    }
    const updated = await this.repo.updateComment(commentId, dto.body);
    this.logger.log('Article comment updated', { commentId });
    return updated;
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.repo.findCommentRecord(commentId);
    if (!comment) {
      throw new NotFoundError(ErrorCode.ARTICLE_COMMENT_NOT_FOUND, 'Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ValidationError(
        ErrorCode.COMMENT_NOT_AUTHOR,
        'Only the author can delete this comment',
      );
    }
    await this.repo.deleteComment(commentId);
    this.logger.log('Article comment deleted', { commentId });
  }

  // ─── Private helpers ──────────────────────────────────────

  private async assertArticleExists(projectId: string, articleId: string) {
    if (!(await this.repo.existsInProject(projectId, articleId))) {
      throw this.articleNotFound();
    }
  }

  private async assertSlugUnique(
    projectId: string,
    slug: string,
    excludeId?: string,
  ) {
    if (!(await this.repo.isSlugFree(projectId, slug, excludeId))) {
      throw new ConflictError(ErrorCode.ARTICLE_SLUG_TAKEN, `Slug "${slug}" is already taken`);
    }
  }

  private async resolveSlug(projectId: string, requested: string): Promise<string> {
    const taken = new Set(await this.repo.findSlugsStartingWith(projectId, requested));
    if (!taken.has(requested)) return requested;

    for (let i = 2; i < 1000; i++) {
      const candidate = `${requested}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }

    throw new ConflictError(
      ErrorCode.ARTICLE_SLUG_TAKEN,
      `Could not generate a unique slug for "${requested}"`,
    );
  }

  private async assertNotDescendant(
    projectId: string,
    articleId: string,
    candidateParentId: string,
  ) {
    const chain = await this.repo.findAncestorChain(
      projectId,
      candidateParentId,
      MAX_ARTICLE_TREE_DEPTH,
    );
    if (chain.includes(articleId)) {
      throw new ValidationError(
        ErrorCode.ARTICLE_CYCLE,
        'Cannot move article under one of its descendants',
      );
    }
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200);
  }

  private articleNotFound(): NotFoundError {
    return new NotFoundError(ErrorCode.ARTICLE_NOT_FOUND, 'Article not found');
  }
}
