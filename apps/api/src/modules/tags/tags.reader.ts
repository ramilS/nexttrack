import { Injectable } from '@nestjs/common';
import type { Tag } from '@repo/shared/schemas';
import { TagsRepository } from './tags.repository';

/**
 * Read-only cross-module surface of the tags aggregate. Modules outside
 * tags/ inject this instead of TagsRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class TagsReader {
  constructor(private repo: TagsRepository) {}

  /** Tags whose name matches `partial` (case-insensitive contains), capped at `limit`. */
  findByNameContains(
    projectId: string,
    partial: string,
    limit: number,
  ): Promise<Tag[]> {
    return this.repo.findByNameContains(projectId, partial, limit);
  }
}
