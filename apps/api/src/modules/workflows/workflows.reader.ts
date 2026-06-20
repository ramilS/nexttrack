import { Injectable } from '@nestjs/common';
import type { Workflow, WorkflowStatus } from '@repo/shared/schemas';
import { WorkflowsRepository } from './workflows.repository';

/**
 * Read-only cross-module surface of the workflows aggregate. Modules outside
 * workflows/ inject this instead of WorkflowsRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class WorkflowsReader {
  constructor(private repo: WorkflowsRepository) {}

  findDefault(projectId: string): Promise<Workflow | null> {
    return this.repo.findDefault(projectId);
  }

  findDefaultStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return this.repo.findDefaultStatuses(projectId);
  }

  findDefaultStatusesByProjects(
    projectIds: string[],
  ): Promise<Map<string, WorkflowStatus[]>> {
    return this.repo.findDefaultStatusesByProjects(projectIds);
  }
}
