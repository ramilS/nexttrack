import { Injectable, Logger } from "@nestjs/common";
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import {
  ActivityType,
  BoardType,
  GlobalRole,
  SprintStatus,
} from "@prisma/client";
import type {
  MoveIssueInput,
  BoardMoveResult,
  Workflow,
  WorkflowTransition,
} from "@repo/shared/schemas";
import { BoardsRepository, BoardEntity } from "./boards.repository";
import { TransactionService } from "@/common/repository/transaction.service";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { IssuesRepository } from "@/modules/issues/issues.repository";
import { BoardIssueMovePatch } from "@/modules/issues/issues-query.builder";
import { SprintsRepository } from "@/modules/sprints/sprints.repository";
import { ActivitiesService } from "@/modules/activities/activities.service";
import type { Tx } from "@/common/repository/tx.types";

const PARENT_CASCADE_MAX_DEPTH = 5;

/**
 * The write side of the board: drag-and-drop issue moves with transition
 * validation, WIP limits, sprint counter upkeep and the parent auto-close /
 * auto-reopen cascade. Extracted from BoardsService, which keeps board
 * CRUD/config only.
 */
@Injectable()
export class BoardIssueMoveService {
  private readonly logger = new Logger(BoardIssueMoveService.name);

  constructor(
    private boardsRepo: BoardsRepository,
    private workflowsRepo: WorkflowsReader,
    private issuesRepo: IssuesRepository,
    private sprintsRepo: SprintsRepository,
    private txService: TransactionService,
    private activitiesService: ActivitiesService,
  ) {}

  async moveIssue(
    projectId: string,
    boardId: string,
    dto: MoveIssueInput,
    actorId: string,
    actorRole?: string,
  ): Promise<BoardMoveResult> {
    const board = await this.requireBoard(projectId, boardId);
    const issue = await this.issuesRepo.findMoveContext(dto.issueId);
    if (!issue || issue.projectId !== projectId) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    return this.txService.run(async (tx) => {
      const updates: BoardIssueMovePatch = {};
      const activities: {
        type: ActivityType;
        from: string | null;
        to: string | null;
      }[] = [];

      if (dto.toStatusId && dto.toStatusId !== issue.statusId) {
        const workflow = await this.requireDefaultWorkflow(projectId);
        const toStatus = workflow.statuses.find((s) => s.id === dto.toStatusId);
        if (!toStatus) {
          throw new ValidationError(
            ErrorCode.WORKFLOW_STATUS_NOT_FOUND,
            "Target status not found in workflow",
          );
        }

        if (actorRole !== GlobalRole.ADMIN) {
          const allowed = this.isTransitionAllowed(
            workflow.transitions,
            issue.statusId,
            dto.toStatusId,
          );
          if (!allowed) {
            throw new PermissionDeniedError(
              ErrorCode.WORKFLOW_TRANSITION_NOT_ALLOWED,
              "Transition not allowed",
            );
          }
        }

        updates.statusId = dto.toStatusId;
        updates.resolvedAt = toStatus.isResolved ? new Date() : null;
        activities.push({
          type: ActivityType.STATUS_CHANGE,
          from: issue.statusId,
          to: dto.toStatusId,
        });

        const targetCol = board.columns.find((c) =>
          c.statusIds.includes(dto.toStatusId!),
        );
        if (targetCol && (targetCol.wipLimit ?? 0) > 0) {
          const countInColumn = await this.issuesRepo.countInStatuses(
            projectId,
            targetCol.statusIds,
            {
              excludeId: dto.issueId,
              sprintId:
                board.type === BoardType.SCRUM ? issue.sprintId : undefined,
            },
            tx,
          );
          if (countInColumn >= (targetCol.wipLimit ?? 0)) {
            throw new ValidationError(
              ErrorCode.WIP_LIMIT_EXCEEDED,
              `WIP limit exceeded for column "${targetCol.name}"`,
            );
          }
        }
      }

      if (dto.toSprintId !== undefined && dto.toSprintId !== issue.sprintId) {
        if (board.type !== BoardType.SCRUM) {
          throw new ValidationError(
            ErrorCode.BOARD_TYPE_MISMATCH,
            "Sprint assignment only for SCRUM boards",
          );
        }

        if (dto.toSprintId !== null) {
          const sprint = await this.sprintsRepo.findByIdInBoard(
            dto.toSprintId,
            boardId,
          );
          if (!sprint) {
            throw new NotFoundError(ErrorCode.SPRINT_NOT_FOUND);
          }
          if (sprint.status === SprintStatus.CLOSED) {
            throw new ValidationError(
              ErrorCode.SPRINT_CLOSED,
              "Cannot move issues to a closed sprint",
            );
          }
        }

        updates.sprintId = dto.toSprintId;
        activities.push({
          type: ActivityType.SPRINT_CHANGE,
          from: issue.sprintId,
          to: dto.toSprintId,
        });
      }

      if (dto.toParentId !== undefined && dto.toParentId !== issue.parentId) {
        if (dto.toParentId !== null) {
          const parent = await this.issuesRepo.findParentScope(
            dto.toParentId,
            tx,
          );
          if (!parent || parent.projectId !== projectId) {
            throw new ValidationError(
              ErrorCode.VALIDATION_ERROR,
              "Parent issue not found in project",
            );
          }
          await this.assertNoParentCycle(dto.issueId, dto.toParentId, tx);
        }

        updates.parentId = dto.toParentId;
        activities.push({
          type: ActivityType.PARENT_CHANGE,
          from: issue.parentId,
          to: dto.toParentId,
        });
      }

      const updatedCard = await this.issuesRepo.updateForBoard(
        dto.issueId,
        updates,
        tx,
      );

      for (const act of activities) {
        await this.activitiesService.recordOne(
          dto.issueId,
          actorId,
          act.type,
          { from: act.from, to: act.to },
          tx,
        );
      }

      if (activities.some((a) => a.type === ActivityType.SPRINT_CHANGE)) {
        if (issue.sprintId) {
          await this.refreshSprintCounters(issue.sprintId, tx);
        }
        if (dto.toSprintId) {
          await this.refreshSprintCounters(dto.toSprintId, tx);
        }
      }
      if (
        activities.some((a) => a.type === ActivityType.STATUS_CHANGE) &&
        issue.sprintId
      ) {
        await this.refreshSprintCounters(issue.sprintId, tx);
      }

      if (
        board.autoCloseOnDone &&
        dto.toStatusId &&
        dto.toStatusId !== issue.statusId
      ) {
        const workflow = await this.requireDefaultWorkflow(projectId);
        await this.cascadeParentStatus(
          { parentId: updatedCard.parentId, statusId: updatedCard.statusId },
          workflow,
          actorId,
          tx,
        );
      }

      return { issue: updatedCard, activities };
    });
  }

  // ─── Private helpers ────────────────────────────────────────

  private async requireBoard(
    projectId: string,
    boardId: string,
  ): Promise<BoardEntity> {
    const board = await this.boardsRepo.findEntityInProject(projectId, boardId);
    if (!board) {
      throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);
    }
    return board;
  }

  private async requireDefaultWorkflow(projectId: string): Promise<Workflow> {
    const workflow = await this.workflowsRepo.findDefault(projectId);
    if (!workflow) {
      throw new NotFoundError(ErrorCode.WORKFLOW_DEFAULT_NOT_FOUND);
    }
    return workflow;
  }

  private isTransitionAllowed(
    transitions: WorkflowTransition[],
    fromStatusId: string,
    toStatusId: string,
  ): boolean {
    if (transitions.length === 0) return true;
    return transitions.some(
      (t) =>
        (t.fromStatusId === fromStatusId || t.fromStatusId === "*") &&
        t.toStatusId === toStatusId,
    );
  }

  private async assertNoParentCycle(
    issueId: string,
    newParentId: string,
    tx: Tx,
  ): Promise<void> {
    const chain = await this.issuesRepo.findAncestorChain(
      newParentId,
      PARENT_CASCADE_MAX_DEPTH + 1,
      tx,
    );
    if (chain.includes(issueId)) {
      throw new ValidationError(
        ErrorCode.CIRCULAR_PARENT,
        "Circular parent reference detected",
      );
    }
    if (chain.length > PARENT_CASCADE_MAX_DEPTH) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        "Maximum nesting depth exceeded",
      );
    }
  }

  private async refreshSprintCounters(sprintId: string, tx: Tx): Promise<void> {
    const totalIssues = await this.issuesRepo.countActiveBySprint(sprintId, tx);
    const completedIssues = await this.issuesRepo.countResolvedBySprint(
      sprintId,
      tx,
    );
    await this.sprintsRepo.updateCounters(
      sprintId,
      { totalIssues, completedIssues },
      tx,
    );
  }

  private async cascadeParentStatus(
    child: { parentId: string | null; statusId: string },
    workflow: Workflow,
    actorId: string,
    tx: Tx,
    depth = 0,
  ): Promise<void> {
    if (!child.parentId || depth >= PARENT_CASCADE_MAX_DEPTH) return;

    const statusMap = new Map(workflow.statuses.map((s) => [s.id, s]));
    const childStatus = statusMap.get(child.statusId);
    if (!childStatus) return;

    const parent = await this.issuesRepo.findParentCascadeContext(
      child.parentId,
      tx,
    );
    if (!parent) return;

    const parentStatus = statusMap.get(parent.statusId);
    if (!parentStatus) return;

    if (childStatus.category === "DONE") {
      const nonDoneStatusIds = workflow.statuses
        .filter((s) => s.category !== "DONE")
        .map((s) => s.id);
      const nonDoneSiblings = await this.issuesRepo.countNonDoneSiblings(
        child.parentId,
        nonDoneStatusIds,
        tx,
      );
      if (nonDoneSiblings === 0 && parentStatus.category !== "DONE") {
        const firstDoneStatus = workflow.statuses.find(
          (s) => s.category === "DONE",
        );
        if (!firstDoneStatus) return;

        await this.issuesRepo.setStatusForCascade(
          parent.id,
          firstDoneStatus.id,
          new Date(),
          tx,
        );
        await this.activitiesService.recordOne(
          parent.id,
          actorId,
          ActivityType.STATUS_CHANGE,
          { from: parent.statusId, to: firstDoneStatus.id, auto: true },
          tx,
        );
        this.logger.log(
          `Auto-closed parent issue ${parent.id} (all children done)`,
        );

        await this.cascadeParentStatus(
          { parentId: parent.parentId, statusId: firstDoneStatus.id },
          workflow,
          actorId,
          tx,
          depth + 1,
        );
      }
    } else if (parentStatus.category === "DONE") {
      const firstStartedStatus = workflow.statuses.find(
        (s) => s.category === "STARTED",
      );
      if (!firstStartedStatus) return;

      await this.issuesRepo.setStatusForCascade(
        parent.id,
        firstStartedStatus.id,
        null,
        tx,
      );
      await this.activitiesService.recordOne(
        parent.id,
        actorId,
        ActivityType.STATUS_CHANGE,
        { from: parent.statusId, to: firstStartedStatus.id, auto: true },
        tx,
      );
      this.logger.log(
        `Auto-reopened parent issue ${parent.id} (child moved out of done)`,
      );

      await this.cascadeParentStatus(
        { parentId: parent.parentId, statusId: firstStartedStatus.id },
        workflow,
        actorId,
        tx,
        depth + 1,
      );
    }
  }
}
