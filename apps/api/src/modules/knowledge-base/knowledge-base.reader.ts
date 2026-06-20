import { Injectable } from '@nestjs/common';
import type { Article } from '@repo/shared/schemas';
import { KnowledgeBaseRepository } from './knowledge-base.repository';

/**
 * Read-only facade over the knowledge base for cross-module consumers
 * (e.g. ai-docs). Exposes exactly what consumers use — see
 * `nestjs-module-boundaries.md`.
 */
@Injectable()
export class KnowledgeBaseReader {
  constructor(private repo: KnowledgeBaseRepository) {}

  /** Up to `limit` non-archived articles in the project (for AI candidate selection). */
  async listForProject(projectId: string, limit: number): Promise<Article[]> {
    const page = await this.repo.findPage(projectId, { pageSize: limit });
    return page.items;
  }

  findById(projectId: string, articleId: string): Promise<Article | null> {
    return this.repo.findById(projectId, articleId);
  }
}
