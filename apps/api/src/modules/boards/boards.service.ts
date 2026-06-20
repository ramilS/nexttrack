import { Injectable } from "@nestjs/common";
import { AppLogger } from "@/common/logging/app-logger";
import { NotFoundError, ValidationError } from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import { BoardType, SwimlaneBy } from "@prisma/client";
import type {
  Board,
  BoardColumn,
  CreateBoardParsed,
  UpdateBoardInput,
  UpdateColumnsInput,
  Workflow,
  WorkflowStatus,
} from "@repo/shared/schemas";
import { BoardsRepository, BoardEntity, toBoard } from "./boards.repository";
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectEntity } from "@/modules/projects/projects.repository";
import { randomUUID } from "crypto";

// Re-export so other modules (sprints) keep their existing import surface.
export {
  BOARD_ISSUE_INCLUDE,
  toBoardIssueCard,
} from "./board-issue-card.mapper";
export type { BoardColumn };

export function getColumns(board: { columns: unknown }): BoardColumn[] {
  return Array.isArray(board.columns) ? (board.columns as BoardColumn[]) : [];
}

/**
 * Board CRUD and column configuration. The read side (rendered board data)
 * lives in BoardDataService; issue drag-and-drop lives in
 * BoardIssueMoveService.
 */
@Injectable()
export class BoardsService {
  private readonly logger = new AppLogger(BoardsService.name);

  constructor(
    private boardsRepo: BoardsRepository,
    private workflowsRepo: WorkflowsReader,
  ) {}

  async findAll(projectId: string): Promise<Board[]> {
    return this.boardsRepo.findAllByProject(projectId);
  }

  async findOne(projectId: string, boardId: string): Promise<Board> {
    return toBoard(await this.requireBoard(projectId, boardId));
  }

  async create(
    project: ProjectEntity,
    dto: CreateBoardParsed,
    userId: string,
  ): Promise<Board> {
    const workflow = await this.requireDefaultWorkflow(project.id);
    const columns = this.buildDefaultColumns(workflow.statuses);

    const board = await this.boardsRepo.create({
      projectId: project.id,
      name: dto.name,
      type: dto.type ?? BoardType.KANBAN,
      columns,
      swimlaneBy: dto.swimlaneBy ?? SwimlaneBy.NONE,
      filterQuery: dto.filterQuery ?? null,
      autoCloseOnDone: dto.autoCloseOnDone ?? true,
      isDefault: false,
      createdById: userId,
    });

    this.logger.log('Board created', {
      boardId: board.id,
      projectId: project.id,
      type: dto.type ?? BoardType.KANBAN,
    });

    const existing = await this.boardsRepo.countByProject(project.id);
    if (existing === 1) {
      await this.boardsRepo.setIsDefault(board.id, true);
      return toBoard({ ...board, isDefault: true });
    }
    return toBoard(board);
  }

  async update(
    projectId: string,
    boardId: string,
    dto: UpdateBoardInput,
  ): Promise<Board> {
    await this.requireBoard(projectId, boardId);
    this.logger.log('Updating board', {
      boardId,
      projectId,
      fields: Object.keys(dto),
    });
    const updated = await this.boardsRepo.update(boardId, {
      name: dto.name,
      swimlaneBy: dto.swimlaneBy,
      filterQuery: dto.filterQuery,
      autoCloseOnDone: dto.autoCloseOnDone,
    });
    return toBoard(updated);
  }

  async updateColumns(
    projectId: string,
    boardId: string,
    dto: UpdateColumnsInput,
  ): Promise<Board> {
    await this.requireBoard(projectId, boardId);
    const workflow = await this.requireDefaultWorkflow(projectId);

    const allStatusIds = workflow.statuses.map((s) => s.id);
    const coveredStatusIds = new Set<string>();

    for (const col of dto.columns) {
      for (const statusId of col.statusIds) {
        if (!allStatusIds.includes(statusId)) {
          throw new ValidationError(
            ErrorCode.WORKFLOW_STATUS_NOT_FOUND,
            `Status ${statusId} does not exist in the workflow`,
          );
        }
        if (coveredStatusIds.has(statusId)) {
          throw new ValidationError(
            ErrorCode.COLUMN_STATUS_DUPLICATE,
            `Status ${statusId} is assigned to more than one column`,
          );
        }
        coveredStatusIds.add(statusId);
      }
    }
    for (const statusId of allStatusIds) {
      if (!coveredStatusIds.has(statusId)) {
        throw new ValidationError(
          ErrorCode.COLUMN_STATUS_NOT_COVERED,
          `Workflow status ${statusId} is not covered by any column`,
        );
      }
    }

    this.logger.log('Updating board columns', {
      boardId,
      projectId,
      columnCount: dto.columns.length,
    });
    const updated = await this.boardsRepo.updateColumns(boardId, dto.columns);
    return toBoard(updated);
  }

  async setDefault(projectId: string, boardId: string): Promise<Board> {
    await this.requireBoard(projectId, boardId);
    await this.boardsRepo.setDefaultAtomic(projectId, boardId);
    return this.findOne(projectId, boardId);
  }

  async remove(projectId: string, boardId: string): Promise<void> {
    const board = await this.requireBoard(projectId, boardId);

    if (board.isDefault) {
      const count = await this.boardsRepo.countByProject(projectId);
      if (count <= 1) {
        throw new ValidationError(
          ErrorCode.BOARD_NOT_FOUND,
          "Cannot delete the only default board",
        );
      }
    }

    await this.boardsRepo.delete(boardId);
    this.logger.log('Board deleted', { boardId, projectId });
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

  private buildDefaultColumns(statuses: WorkflowStatus[]): BoardColumn[] {
    const unstarted = statuses.filter((s) => s.category === "UNSTARTED");
    const started = statuses.filter((s) => s.category === "STARTED");
    const done = statuses.filter((s) => s.category === "DONE");

    const columns: BoardColumn[] = [];
    if (unstarted.length > 0) {
      columns.push({
        id: randomUUID(),
        name: "To Do",
        statusIds: unstarted.map((s) => s.id),
        ordinal: 0,
      });
    }
    if (started.length > 0) {
      columns.push({
        id: randomUUID(),
        name: "In Progress",
        statusIds: started.map((s) => s.id),
        ordinal: 1,
      });
    }
    if (done.length > 0) {
      columns.push({
        id: randomUUID(),
        name: "Done",
        statusIds: done.map((s) => s.id),
        ordinal: 2,
      });
    }
    return columns;
  }
}
