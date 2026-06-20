import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  Workflow,
  WorkflowStatus,
  CreateWorkflowParsed,
  UpdateWorkflowParsed,
} from '@repo/shared/schemas';
import { TransactionService } from '@/common/repository/transaction.service';
import { WorkflowsRepository, toWorkflow } from './workflows.repository';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import { randomUUID } from 'crypto';

// Re-export so other modules keep working through the service surface.
export { toWorkflow };

const BLOCKED_ISSUES_PREVIEW_LIMIT = 20;

@Injectable()
export class WorkflowsService {
  private readonly logger = new AppLogger(WorkflowsService.name);

  constructor(
    private workflowsRepo: WorkflowsRepository,
    private issuesRepo: IssuesRepository,
    private txService: TransactionService,
  ) {}

  findAll(projectId: string): Promise<Workflow[]> {
    return this.workflowsRepo.findAllByProject(projectId);
  }

  async getDefaultStatuses(projectId: string): Promise<WorkflowStatus[]> {
    const workflow = await this.workflowsRepo.findDefault(projectId);
    if (!workflow) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }
    return workflow.statuses;
  }

  async findOne(projectId: string, id: string): Promise<Workflow> {
    return this.requireWorkflow(projectId, id);
  }

  async create(project: ProjectEntity, dto: CreateWorkflowParsed): Promise<Workflow> {
    this.validateStatuses(dto.statuses);

    const statuses = dto.statuses.map((s) => ({ ...s, id: s.id ?? randomUUID() }));
    const transitions = dto.transitions.map((t) => ({ ...t, id: t.id ?? randomUUID() }));

    const created = await this.workflowsRepo.create({
      projectId: project.id,
      name: dto.name,
      isDefault: false,
      statuses,
      transitions,
    });

    this.logger.log('Workflow created', {
      workflowId: created.id,
      projectId: project.id,
      statusCount: statuses.length,
      transitionCount: transitions.length,
    });

    return created;
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateWorkflowParsed,
  ): Promise<Workflow> {
    const existing = await this.requireWorkflow(projectId, id);
    this.validateStatuses(dto.statuses);

    const existingStatusIds = existing.statuses.map((s) => s.id);
    const newStatusIds = dto.statuses.map((s) => s.id);
    const removedStatusIds = existingStatusIds.filter((sid) => !newStatusIds.includes(sid));

    if (removedStatusIds.length > 0) {
      await this.validateRemovedStatuses(projectId, removedStatusIds, dto, newStatusIds);
    }

    this.logger.log('Updating workflow', {
      workflowId: id,
      projectId,
      statusCount: dto.statuses.length,
      removedStatusIds,
      hasMigration: dto.migrateStatusMapping !== undefined,
    });

    return this.txService.run(async (tx) => {
      if (removedStatusIds.length > 0 && dto.migrateStatusMapping) {
        const migrations = Object.entries(dto.migrateStatusMapping).filter(
          ([fromId]) => removedStatusIds.includes(fromId),
        );

        for (const [fromId, toId] of migrations) {
          this.logger.log('Migrating issues to new status', {
            workflowId: id,
            projectId,
            from: fromId,
            to: toId,
          });
        }

        await Promise.all(
          migrations.map(([fromId, toId]) => {
            const targetStatus = dto.statuses.find((s) => s.id === toId);
            return this.issuesRepo.migrateStatusBatch(
              projectId,
              fromId,
              toId,
              targetStatus?.isResolved ?? false,
              tx,
            );
          }),
        );
      }

      return this.workflowsRepo.update(
        id,
        {
          name: dto.name ?? existing.name,
          statuses: dto.statuses,
          transitions: dto.transitions,
        },
        tx,
      );
    });
  }

  async setDefault(projectId: string, id: string): Promise<Workflow> {
    await this.requireWorkflow(projectId, id);
    await this.workflowsRepo.setDefaultAtomic(projectId, id);
    this.logger.log('Workflow set as default', { workflowId: id, projectId });
    return this.requireWorkflow(projectId, id);
  }

  async remove(projectId: string, id: string): Promise<void> {
    const workflow = await this.requireWorkflow(projectId, id);

    if (workflow.isDefault) {
      throw new ValidationError(
        ErrorCode.CANNOT_DELETE_DEFAULT_WORKFLOW,
        'Cannot delete the default workflow',
      );
    }

    await this.workflowsRepo.delete(id);

    this.logger.log('Workflow deleted', { workflowId: id, projectId });
  }

  // ─── Private ─────────────────────────────────────────────────

  private async requireWorkflow(projectId: string, id: string): Promise<Workflow> {
    const wf = await this.workflowsRepo.findById(id, projectId);
    if (!wf) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }
    return wf;
  }

  private async validateRemovedStatuses(
    projectId: string,
    removedStatusIds: string[],
    dto: UpdateWorkflowParsed,
    newStatusIds: string[],
  ): Promise<void> {
    const affectedCount = await this.issuesRepo.countByProjectAndStatuses(
      projectId,
      removedStatusIds,
    );
    if (affectedCount === 0) return;

    if (!dto.migrateStatusMapping) {
      const blockedIssues = await this.issuesRepo.findBlockedByStatuses(
        projectId,
        removedStatusIds,
        BLOCKED_ISSUES_PREVIEW_LIMIT,
      );

      throw new ConflictError(
        ErrorCode.WORKFLOW_STATUS_IN_USE,
        `Cannot remove statuses used by ${affectedCount} issue(s). Provide migrateStatusMapping to migrate them.`,
        { affectedCount, blockedIssues },
      );
    }

    for (const [fromId, toId] of Object.entries(dto.migrateStatusMapping)) {
      if (!removedStatusIds.includes(fromId)) continue;
      if (!newStatusIds.includes(toId)) {
        throw new ValidationError(
          ErrorCode.WORKFLOW_STATUS_NOT_FOUND,
          `Migration target status "${toId}" not found in new workflow statuses`,
        );
      }
    }

    const unmapped = removedStatusIds.filter((sid) => !dto.migrateStatusMapping![sid]);
    if (unmapped.length > 0) {
      const hasIssues = await this.issuesRepo.countByProjectAndStatuses(projectId, unmapped);
      if (hasIssues > 0) {
        throw new ValidationError(
          ErrorCode.VALIDATION_ERROR,
          'All removed statuses with existing issues must have migration targets',
        );
      }
    }
  }

  private validateStatuses(statuses: { isInitial: boolean }[]): void {
    const initialCount = statuses.filter((s) => s.isInitial).length;
    if (initialCount !== 1) {
      throw new ValidationError(
        ErrorCode.WORKFLOW_INVALID_INITIAL,
        'Workflow must have exactly one initial status',
      );
    }
  }
}
