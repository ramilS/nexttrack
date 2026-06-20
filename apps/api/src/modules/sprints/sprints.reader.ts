import { Injectable } from '@nestjs/common';
import type { Sprint } from '@repo/shared/schemas';
import { SprintsRepository } from './sprints.repository';

/**
 * Read-only cross-module surface of the sprints aggregate. Modules outside
 * sprints/ inject this instead of SprintsRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class SprintsReader {
  constructor(private repo: SprintsRepository) {}

  /** Scoped lookup: only returns the sprint if it belongs to the given board. */
  findByIdInBoard(sprintId: string, boardId: string): Promise<Sprint | null> {
    return this.repo.findByIdInBoard(sprintId, boardId);
  }

  findActiveOrFirstPlanning(boardId: string): Promise<Sprint | null> {
    return this.repo.findActiveOrFirstPlanning(boardId);
  }

  /**
   * Closed sprints with their non-deleted issues (estimate + statusId only),
   * ordered newest closed first. Used by board velocity analytics.
   */
  findClosedWithEstimates(
    boardId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      startDate: Date | null;
      endDate: Date | null;
      issues: Array<{ estimate: number | null; statusId: string }>;
    }>
  > {
    return this.repo.findClosedWithEstimates(boardId, limit);
  }
}
