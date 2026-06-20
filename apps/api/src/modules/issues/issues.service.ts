import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { DomainEventPublisher } from '@/modules/outbox/domain-event-publisher';
import type {
  CreateIssueParsed,
  UpdateIssueInput,
  BulkUpdateIssuesInput,
  BulkUpdateResult,
  IssueDetail,
  UserSummary,
  Workflow,
} from '@repo/shared/schemas';
import { WorkflowTrigger } from '@prisma/client';
import { IssuesRepository, IssueUpdateContext } from './issues.repository';
import { IssueHierarchyService } from './issue-hierarchy.service';
import {
  IssueUpdatePatch,
  IssueBulkUpdatePatch,
} from './issues-query.builder';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { TransactionService } from '@/common/repository/transaction.service';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import { buildActivities } from '@/modules/activities/activity-builder';
import { CustomFieldValuesService } from '@/modules/custom-fields/custom-field-values.service';
import { WorkflowEngine } from '@/modules/workflow-automation/workflow-engine';
import type { EvaluationContext } from '@/modules/workflow-automation/condition-evaluator';
import {
  IssueCreatedEvent,
  IssueUpdatedEvent,
  IssueDeletedEvent,
  IssueRestoredEvent,
} from './events/issue.events';
import { toIssueDetail } from './issues.mappers';

/**
 * Core issue mutations: create, update, soft-delete/restore, bulk update
 * and watcher management. The read side (lists, detail, children) lives in
 * IssuesQueryService; re-parenting lives in IssueHierarchyService.
 */
@Injectable()
export class IssuesService {
  private readonly logger = new AppLogger(IssuesService.name);

  constructor(
    private issuesRepo: IssuesRepository,
    private workflowsRepo: WorkflowsReader,
    private membersRepo: ProjectMembersRepository,
    private tagsRepo: TagsRepository,
    private usersRepo: UsersReader,
    private txService: TransactionService,
    private customFieldValues: CustomFieldValuesService,
    private domainEvents: DomainEventPublisher,
    private workflowEngine: WorkflowEngine,
    private hierarchy: IssueHierarchyService,
  ) {}

  private async assertNoBlockingRule(
    projectId: string,
    issueId: string,
    fromStatusId: string,
    toStatusId: string,
    issueCtx: { type: string; priority: string; assigneeId: string | null },
  ): Promise<void> {
    const tagRows = await this.issuesRepo.findForRuleEvaluation(issueId);
    const context: EvaluationContext = {
      issue: {
        type: issueCtx.type,
        priority: issueCtx.priority,
        statusId: fromStatusId,
        assigneeId: issueCtx.assigneeId,
        tagIds: tagRows?.tagIds ?? [],
      },
      oldStatusId: fromStatusId,
      newStatusId: toStatusId,
    };
    await this.workflowEngine.evaluateGuards(
      projectId,
      WorkflowTrigger.ON_STATUS_CHANGE,
      context,
    );
  }

  async create(
    project: ProjectEntity,
    dto: CreateIssueParsed,
    userId: string,
  ): Promise<IssueDetail> {
    const workflow = await this.requireDefaultWorkflow(project.id);

    const statusId = dto.statusId ?? workflow.statuses.find((s) => s.isInitial)?.id;
    if (!statusId || !workflow.statuses.find((s) => s.id === statusId)) {
      throw new ValidationError(
        ErrorCode.INVALID_STATUS,
        'Invalid status ID for this project workflow',
      );
    }

    if (dto.assigneeId) {
      await this.assertMember(project.id, dto.assigneeId);
    }
    if (dto.parentId) {
      await this.hierarchy.assertValidParent(project.id, dto.parentId);
    }
    if (dto.tagIds?.length) {
      await this.assertTagsBelongToProject(project.id, dto.tagIds);
    }

    const number = await this.issuesRepo.getNextNumber(project.id);
    const status = workflow.statuses.find((s) => s.id === statusId)!;

    const issue = await this.txService.run(async (tx) => {
      const created = await this.issuesRepo.createWithDetails(
        {
          projectId: project.id,
          number,
          title: dto.title,
          description: dto.description ?? null,
          type: dto.type,
          priority: dto.priority,
          statusId,
          reporterId: userId,
          assigneeId: dto.assigneeId ?? null,
          parentId: dto.parentId ?? null,
          sprintId: dto.sprintId ?? null,
          dueDate: dto.dueDate ?? null,
          estimate: dto.estimate ?? null,
          resolved: status.isResolved,
          tagIds: dto.tagIds ?? [],
        },
        tx,
      );

      await this.domainEvents.publish(
        {
          eventType: 'issue.created',
          aggregateType: 'Issue',
          aggregateId: created.id,
          payload: {
            ...new IssueCreatedEvent(
              created.id,
              project.id,
              project.key,
              project.name,
              number,
              dto.title,
              userId,
              dto.description ?? undefined,
              dto.assigneeId,
              created.reporter.name,
            ),
          },
        },
        tx,
      );

      if (dto.fieldValues?.length) {
        await this.customFieldValues.setInitialFieldValues(
          created.id,
          project.id,
          userId,
          dto.fieldValues.map((fv) => ({ fieldId: fv.fieldId, value: fv.value })),
          tx,
        );
      }

      return created;
    });

    this.logger.log('Issue created', {
      issueId: issue.id,
      projectId: project.id,
      number,
      type: dto.type,
      priority: dto.priority,
      statusId,
      assigneeId: dto.assigneeId ?? null,
      parentId: dto.parentId ?? null,
      tagCount: dto.tagIds?.length ?? 0,
      fieldValueCount: dto.fieldValues?.length ?? 0,
    });

    return toIssueDetail(issue, workflow.statuses, userId);
  }

  async update(
    project: ProjectEntity,
    issueNumber: number,
    dto: UpdateIssueInput,
    userId: string,
  ): Promise<IssueDetail> {
    const issue = await this.issuesRepo.findEntityByNumber(project.id, issueNumber);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    const statusChanged =
      dto.statusId !== undefined && dto.statusId !== issue.statusId;
    const assigneeChanged =
      dto.assigneeId !== undefined && dto.assigneeId !== issue.assigneeId;

    this.logger.log('Updating issue', {
      issueId: issue.id,
      projectId: project.id,
      number: issue.number,
      fields: Object.keys(dto),
      statusFrom: statusChanged ? issue.statusId : undefined,
      statusTo: statusChanged ? dto.statusId : undefined,
      assigneeFrom: assigneeChanged ? issue.assigneeId : undefined,
      assigneeTo: assigneeChanged ? dto.assigneeId : undefined,
      parentId: dto.parentId,
    });

    const workflow = await this.requireDefaultWorkflow(project.id);

    const updateData = await this.resolveUpdatePatch(project, issue, workflow, dto);

    const usersMap = await this.buildUsersMap(issue.assigneeId, dto.assigneeId);

    const activities = buildActivities(
      issue,
      { ...dto, ...updateData },
      { workflow: { statuses: workflow.statuses }, users: usersMap },
    );

    const updated = await this.txService.run(async (tx) => {
      const row = await this.issuesRepo.updateWithTagsTx(
        issue.id,
        updateData,
        dto.tagIds,
        project.id,
        tx,
        dto.version,
      );
      if (!row) return null;

      await this.domainEvents.publish(
        {
          eventType: 'issue.updated',
          aggregateType: 'Issue',
          aggregateId: issue.id,
          payload: {
            ...new IssueUpdatedEvent(
              issue.id,
              project.id,
              project.key,
              project.name,
              issue.number,
              issue.title,
              userId,
              activities,
              {
                assigneeId: dto.assigneeId,
                statusId: dto.statusId,
                description: dto.description ?? undefined,
              },
              {
                assigneeId: issue.assigneeId,
                statusId: issue.statusId,
                resolvedAt: issue.resolvedAt,
                description: issue.description,
              },
              workflow.statuses,
              row.reporter.name,
            ),
          },
        },
        tx,
      );
      return row;
    });

    if (!updated) {
      throw new ConflictError(
        ErrorCode.ISSUE_VERSION_CONFLICT,
        'Issue was modified by someone else. Refresh and try again.',
      );
    }

    return toIssueDetail(updated, workflow.statuses, userId);
  }

  /**
   * Maps a validated update DTO to the repository patch, running every
   * cross-field check (workflow status validity + blocking-rule guard +
   * resolvedAt derivation, assignee/parent/sprint membership, tag ownership).
   * Returns only the fields present in the DTO — undefined keys are skipped
   * so PATCH semantics hold.
   */
  private async resolveUpdatePatch(
    project: ProjectEntity,
    issue: IssueUpdateContext,
    workflow: Workflow,
    dto: UpdateIssueInput,
  ): Promise<IssueUpdatePatch> {
    const updateData: IssueUpdatePatch = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) {
      updateData.description = dto.description ?? null;
    }
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.estimate !== undefined) updateData.estimate = dto.estimate;
    if (dto.startDate !== undefined) {
      updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    if (dto.statusId !== undefined) {
      const status = workflow.statuses.find((s) => s.id === dto.statusId);
      if (!status) {
        throw new ValidationError(
          ErrorCode.INVALID_STATUS,
          'Invalid status ID for this project workflow',
        );
      }
      if (dto.statusId !== issue.statusId) {
        await this.assertNoBlockingRule(
          project.id,
          issue.id,
          issue.statusId,
          dto.statusId,
          { type: issue.type, priority: issue.priority, assigneeId: issue.assigneeId },
        );
      }
      updateData.statusId = dto.statusId;
      if (status.isResolved && !issue.resolvedAt) {
        updateData.resolvedAt = new Date();
      } else if (!status.isResolved && issue.resolvedAt) {
        updateData.resolvedAt = null;
      }
    }

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        await this.assertMember(project.id, dto.assigneeId);
      }
      updateData.assigneeId = dto.assigneeId;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        await this.hierarchy.assertValidParent(project.id, dto.parentId);
        await this.hierarchy.assertNoCycle(issue.id, dto.parentId);
      }
      updateData.parentId = dto.parentId;
    }

    if (dto.sprintId !== undefined) {
      if (dto.sprintId) {
        const sprintProjectId = await this.issuesRepo.findSprintBoardProjectId(dto.sprintId);
        if (sprintProjectId !== project.id) {
          throw new ValidationError(ErrorCode.SPRINT_PROJECT_MISMATCH);
        }
      }
      updateData.sprintId = dto.sprintId;
    }

    if (dto.tagIds !== undefined) {
      await this.assertTagsBelongToProject(project.id, dto.tagIds);
    }

    return updateData;
  }

  async softDelete(
    project: ProjectEntity,
    issueNumber: number,
    userId: string,
  ): Promise<void> {
    const issue = await this.issuesRepo.findEntityByNumber(project.id, issueNumber);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    await this.txService.run(async (tx) => {
      await this.issuesRepo.softDelete(issue.id, userId, tx);
      await this.domainEvents.publish(
        {
          eventType: 'issue.deleted',
          aggregateType: 'Issue',
          aggregateId: issue.id,
          payload: { ...new IssueDeletedEvent(issue.id, userId) },
        },
        tx,
      );
    });

    this.logger.log('Issue soft-deleted', {
      issueId: issue.id,
      projectId: project.id,
      number: issue.number,
    });
  }

  async restore(
    project: ProjectEntity,
    issueNumber: number,
    userId: string,
  ): Promise<IssueDetail> {
    const issue = await this.issuesRepo.findDeletedByNumber(project.id, issueNumber);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    const updated = await this.txService.run(async (tx) => {
      const row = await this.issuesRepo.restoreWithDetails(issue.id, tx);
      await this.domainEvents.publish(
        {
          eventType: 'issue.restored',
          aggregateType: 'Issue',
          aggregateId: issue.id,
          payload: { ...new IssueRestoredEvent(issue.id, userId) },
        },
        tx,
      );
      return row;
    });

    this.logger.log('Issue restored', {
      issueId: issue.id,
      projectId: project.id,
      number: issueNumber,
    });

    const workflow = await this.requireDefaultWorkflow(project.id);
    return toIssueDetail(updated, workflow.statuses, userId);
  }

  async bulkUpdate(
    project: ProjectEntity,
    dto: BulkUpdateIssuesInput,
    userId: string,
  ): Promise<BulkUpdateResult> {
    const issues = await this.issuesRepo.findManyForBulk(project.id, dto.issueIds);
    const validIds = new Set(issues.map((i) => i.id));
    const failed = dto.issueIds.filter((id) => !validIds.has(id));

    // Authorization parity with the single-update path: a bulk assignee must be
    // a project member, and bulk tags must belong to this project — otherwise
    // bulk is an authz hole that the per-issue path closes.
    if (dto.update.assigneeId) {
      await this.assertMember(project.id, dto.update.assigneeId);
    }
    if (dto.update.tagIds !== undefined) {
      await this.assertTagsBelongToProject(project.id, dto.update.tagIds);
    }

    let workflow: Workflow | undefined;
    let targetStatus: Workflow['statuses'][number] | undefined;
    if (dto.update.statusId) {
      const wf = await this.requireDefaultWorkflow(project.id);
      workflow = wf;
      targetStatus = wf.statuses.find((s) => s.id === dto.update.statusId);
      if (!targetStatus) {
        throw new ValidationError(
          ErrorCode.WORKFLOW_STATUS_NOT_FOUND,
          'Target status not found in workflow',
        );
      }

      if (wf.transitions.length > 0) {
        const blockedIds = issues
          .filter((issue) => issue.statusId !== dto.update.statusId)
          .filter(
            (issue) =>
              !wf.transitions.some(
                (t) =>
                  (t.fromStatusId === issue.statusId || t.fromStatusId === '*') &&
                  t.toStatusId === dto.update.statusId,
              ),
          )
          .map((i) => i.id);
        if (blockedIds.length > 0) {
          throw new ValidationError(
            ErrorCode.WORKFLOW_TRANSITION_NOT_ALLOWED,
            `Workflow transition not allowed for ${blockedIds.length} issue(s)`,
          );
        }
      }

      // BLOCK_TRANSITION guards: any workflow-automation rule with this
      // action and matching condition aborts the whole bulk. Fetch the rules
      // once and evaluate each issue in memory to avoid an N+1 query.
      const guardRules = await this.workflowEngine.findGuardRules(
        project.id,
        WorkflowTrigger.ON_STATUS_CHANGE,
      );
      for (const issue of issues) {
        if (issue.statusId === dto.update.statusId) continue;
        this.workflowEngine.evaluateGuardsForRules(guardRules, {
          issue: {
            type: issue.type,
            priority: issue.priority,
            statusId: issue.statusId,
            assigneeId: issue.assigneeId,
            tagIds: issue.tagIds,
          },
          oldStatusId: issue.statusId,
          newStatusId: dto.update.statusId,
        });
      }
    }

    const updateData: IssueBulkUpdatePatch = {};
    if (dto.update.statusId && targetStatus) {
      updateData.statusId = dto.update.statusId;
      updateData.resolvedAt = targetStatus.isResolved ? new Date() : null;
    }
    if (dto.update.assigneeId !== undefined) updateData.assigneeId = dto.update.assigneeId;
    if (dto.update.priority) updateData.priority = dto.update.priority;

    const validIssueIds = [...validIds];

    // Resolve the assignee display names once (old assignees + the new one) so
    // per-issue activities don't issue a query each.
    const usersMap =
      dto.update.assigneeId !== undefined
        ? await this.buildBulkAssigneeMap(issues, dto.update.assigneeId)
        : new Map();

    // statuses are needed for the event regardless of whether status changed.
    const resolvedWorkflow =
      workflow ?? (await this.requireDefaultWorkflow(project.id));
    const statuses = resolvedWorkflow.statuses;

    await this.txService.run(async (tx) => {
      await this.issuesRepo.bulkUpdate(validIssueIds, updateData, tx);
      if (dto.update.tagIds !== undefined) {
        await this.tagsRepo.replaceIssueLinksBulk(
          validIssueIds,
          dto.update.tagIds,
          project.id,
          tx,
        );
      }

      // One issue.updated per affected issue so activities, notifications,
      // workflow rules and ES re-indexing fire — exactly like single update.
      // The listener's guards skip no-op changes per issue.
      for (const issue of issues) {
        const activities = buildActivities(
          issue,
          { ...updateData },
          { workflow: { statuses }, users: usersMap },
        );
        await this.domainEvents.publish(
          {
            eventType: 'issue.updated',
            aggregateType: 'Issue',
            aggregateId: issue.id,
            payload: {
              ...new IssueUpdatedEvent(
                issue.id,
                project.id,
                project.key,
                project.name,
                issue.number,
                issue.title,
                userId,
                activities,
                { assigneeId: dto.update.assigneeId, statusId: dto.update.statusId },
                {
                  assigneeId: issue.assigneeId,
                  statusId: issue.statusId,
                  resolvedAt: issue.resolvedAt,
                  description: null,
                },
                statuses,
                issue.reporterName,
              ),
            },
          },
          tx,
        );
      }
    });

    this.logger.log('Issues bulk-updated', {
      projectId: project.id,
      fields: Object.keys(dto.update),
      statusId: dto.update.statusId,
      assigneeId: dto.update.assigneeId,
      priority: dto.update.priority,
      updated: validIssueIds.length,
      failed: failed.length,
    });

    return { updated: validIssueIds.length, failed };
  }

  // ─── Watchers ──────────────────────────────────────────────

  addWatcher(issueId: string, userId: string): Promise<void> {
    return this.issuesRepo.addWatcher(issueId, userId);
  }

  async removeWatcher(issueId: string, userId: string): Promise<void> {
    try {
      await this.issuesRepo.removeWatcher(issueId, userId);
    } catch (err) {
      this.logger.warn(`Failed to remove watcher: ${(err as Error).message}`);
    }
  }

  getWatchers(issueId: string): Promise<UserSummary[]> {
    return this.issuesRepo.findWatchers(issueId);
  }

  // ─── Private helpers ───────────────────────────────────────

  private async requireDefaultWorkflow(projectId: string): Promise<Workflow> {
    const workflow = await this.workflowsRepo.findDefault(projectId);
    if (!workflow) {
      throw new NotFoundError(ErrorCode.WORKFLOW_DEFAULT_NOT_FOUND);
    }
    return workflow;
  }

  private async assertMember(projectId: string, userId: string): Promise<void> {
    const isMember = await this.membersRepo.isMember(userId, projectId);
    if (!isMember) {
      throw new ValidationError(
        ErrorCode.INVALID_ASSIGNEE,
        'User is not a member of this project',
      );
    }
  }

  private async assertTagsBelongToProject(
    projectId: string,
    tagIds: string[],
  ): Promise<void> {
    if (tagIds.length === 0) return;
    const count = await this.tagsRepo.countInProject(projectId, tagIds);
    if (count !== tagIds.length) {
      throw new ValidationError(ErrorCode.NOT_FOUND, 'Some tags do not belong to this project');
    }
  }

  private async buildUsersMap(
    oldAssigneeId: string | null,
    newAssigneeId: string | null | undefined,
  ): Promise<Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>> {
    const ids = [oldAssigneeId, newAssigneeId].filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return new Map();
    const users = await this.usersRepo.findPublicRefsByIds(ids);
    return new Map(users.map((u) => [u.id, u]));
  }

  /** Like {@link buildUsersMap} but for a bulk update: every issue's current
   * assignee plus the single new assignee, resolved in one query. */
  private async buildBulkAssigneeMap(
    issues: Array<{ assigneeId: string | null }>,
    newAssigneeId: string | null,
  ): Promise<Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>> {
    const ids = [...new Set([...issues.map((i) => i.assigneeId), newAssigneeId])].filter(
      (id): id is string => typeof id === 'string',
    );
    if (ids.length === 0) return new Map();
    const users = await this.usersRepo.findPublicRefsByIds(ids);
    return new Map(users.map((u) => [u.id, u]));
  }
}
