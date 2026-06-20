import { Injectable } from "@nestjs/common";
import { AppLogger } from "@/common/logging/app-logger";
import { NotFoundError, ValidationError } from "@/common/errors/domain.errors";
import { BoardType, NotificationType, SprintStatus } from "@prisma/client";
import { ErrorCode } from "@repo/shared/error-codes";
import type {
  PaginatedResponse,
  CursorPaginatedResponse,
} from "@repo/shared";
import type {
  CreateSprintInput,
  UpdateSprintInput,
  CloseSprintInput,
  CloseSprintResult,
  Sprint,
  BurndownPoint,
  BoardIssueCard,
  BacklogResponse,
  AddSprintIssuesResult,
  RemoveSprintIssuesResult,
} from "@repo/shared/schemas";
import { NotificationsDispatchService } from "@/modules/notifications/notifications-dispatch.service";
import { BackgroundTasks } from "@/common/background/background-tasks.service";
import { TransactionService } from "@/common/repository/transaction.service";
import { SprintsRepository } from "./sprints.repository";
import { IssuesRepository } from "@/modules/issues/issues.repository";
import { BoardsReader } from "@/modules/boards/boards.reader";
import { ProjectMembersRepository } from "@/modules/projects/project-members.repository";

@Injectable()
export class SprintsService {
  private readonly logger = new AppLogger(SprintsService.name);

  constructor(
    private sprintsRepo: SprintsRepository,
    private issuesRepo: IssuesRepository,
    private boardsReader: BoardsReader,
    private projectMembersRepo: ProjectMembersRepository,
    private txService: TransactionService,
    private notificationsDispatch: NotificationsDispatchService,
    private background: BackgroundTasks,
  ) {}

  async findAll(
    boardId: string,
    options?: { status?: SprintStatus; page?: number; perPage?: number },
  ): Promise<PaginatedResponse<Sprint>> {
    const page = options?.page ?? 1;
    const perPage = options?.perPage ?? 20;

    const { items, total } = await this.sprintsRepo.findPage(boardId, {
      ...(options?.status ? { status: options.status } : {}),
      page,
      perPage,
    });

    return {
      items,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findOne(boardId: string, sprintId: string): Promise<Sprint> {
    const sprint = await this.sprintsRepo.findById(sprintId, boardId);
    if (!sprint) {
      throw new NotFoundError(ErrorCode.SPRINT_NOT_FOUND);
    }
    return sprint;
  }

  async create(boardId: string, dto: CreateSprintInput): Promise<Sprint> {
    const board = await this.boardsReader.findRefById(boardId);
    if (!board) {
      throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);
    }
    if (board.type !== BoardType.SCRUM) {
      throw new ValidationError(
        ErrorCode.BOARD_TYPE_MISMATCH,
        "Sprints can only be created for SCRUM boards",
      );
    }

    const maxOrdinal = await this.sprintsRepo.maxOrdinal(boardId);
    const sprint = await this.sprintsRepo.create({
      boardId,
      name: dto.name,
      goal: dto.goal ?? null,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      ordinal: maxOrdinal + 1,
    });
    this.logger.log('Sprint created', { sprintId: sprint.id, boardId });
    return sprint;
  }

  async update(
    boardId: string,
    sprintId: string,
    dto: UpdateSprintInput,
  ): Promise<Sprint> {
    const sprint = await this.findOne(boardId, sprintId);

    if (sprint.status === SprintStatus.CLOSED) {
      throw new ValidationError(
        ErrorCode.SPRINT_CLOSED,
        "Cannot edit a closed sprint",
      );
    }

    this.logger.log('Updating sprint', {
      sprintId,
      boardId,
      fields: Object.keys(dto),
    });
    return this.sprintsRepo.update(sprintId, dto);
  }

  async start(
    boardId: string,
    sprintId: string,
    userId: string,
    body?: { startDate?: string; endDate?: string },
  ): Promise<Sprint> {
    const sprint = await this.findOne(boardId, sprintId);

    if (sprint.status !== SprintStatus.PLANNING) {
      throw new ValidationError(
        ErrorCode.SPRINT_NOT_ACTIVE,
        "Only PLANNING sprints can be started",
      );
    }

    const activeSprint = await this.sprintsRepo.findActiveOnBoard(boardId);
    if (activeSprint) {
      throw new ValidationError(
        ErrorCode.SPRINT_ALREADY_ACTIVE,
        "There is already an active sprint on this board",
      );
    }

    const issueCount = await this.issuesRepo.countActiveBySprint(sprintId);
    if (issueCount === 0) {
      throw new ValidationError(
        ErrorCode.SPRINT_EMPTY,
        "Cannot start an empty sprint",
      );
    }

    const now = new Date();
    const updated = await this.sprintsRepo.update(sprintId, {
      status: SprintStatus.ACTIVE,
      startedAt: now.toISOString(),
      startDate: body?.startDate ?? sprint.startDate ?? now.toISOString(),
      endDate: body?.endDate ?? sprint.endDate,
      totalIssues: issueCount,
    });

    this.logger.log('Sprint started', {
      sprintId,
      boardId,
      totalIssues: issueCount,
    });

    const board = await this.boardsReader.findRefWithProjectName(boardId);
    if (board) {
      const memberIds = await this.projectMembersRepo.findMemberIds(
        board.projectId,
      );
      this.background.run(
        () =>
          this.notificationsDispatch.dispatch({
            type: NotificationType.SPRINT_STARTED,
            actorId: userId,
            recipientIds: memberIds,
            projectId: board.projectId,
            payload: {
              sprintName: updated.name,
              projectName: board.projectName,
            },
          }),
        (err) =>
          this.logger.error(`Notification dispatch failed: ${err.message}`, err),
      );
    }

    return updated;
  }

  async close(
    boardId: string,
    sprintId: string,
    dto: CloseSprintInput,
    userId?: string,
  ): Promise<CloseSprintResult> {
    const sprint = await this.sprintsRepo.findById(sprintId, boardId);
    if (!sprint) {
      throw new NotFoundError(ErrorCode.SPRINT_NOT_FOUND);
    }
    if (sprint.status !== SprintStatus.ACTIVE) {
      throw new ValidationError(
        ErrorCode.SPRINT_NOT_ACTIVE,
        "Only active sprints can be closed",
      );
    }

    const result = await this.txService.run(async (tx) => {
      const issues = await this.issuesRepo.findSprintIssueStats(sprintId, tx);
      const completed = issues.filter((i) => i.resolvedAt !== null);
      const incomplete = issues.filter((i) => i.resolvedAt === null);

      if (incomplete.length > 0) {
        if (dto.incompleteIssuesAction === "MOVE_TO_BACKLOG") {
          await this.issuesRepo.moveToSprint(
            incomplete.map((i) => i.id),
            null,
            tx,
          );
        } else {
          if (!dto.nextSprintId) {
            throw new ValidationError(ErrorCode.SPRINT_NEXT_SPRINT_REQUIRED);
          }
          const nextSprint = await this.sprintsRepo.findById(
            dto.nextSprintId,
            undefined,
            tx,
          );
          if (
            !nextSprint ||
            nextSprint.boardId !== boardId ||
            nextSprint.status === SprintStatus.CLOSED
          ) {
            throw new ValidationError(
              ErrorCode.SPRINT_CLOSED,
              "Next sprint is closed, not found, or belongs to a different board",
            );
          }

          await this.issuesRepo.moveToSprint(
            incomplete.map((i) => i.id),
            dto.nextSprintId,
            tx,
          );

          const [nextTotal, nextCompleted] = await Promise.all([
            this.issuesRepo.countActiveBySprint(dto.nextSprintId, tx),
            this.issuesRepo.countResolvedBySprint(dto.nextSprintId, tx),
          ]);
          await this.sprintsRepo.update(
            dto.nextSprintId,
            { totalIssues: nextTotal, completedIssues: nextCompleted },
            tx,
          );
        }
      }

      const closedSprint = await this.sprintsRepo.update(
        sprintId,
        {
          status: SprintStatus.CLOSED,
          closedAt: new Date().toISOString(),
          completedIssues: completed.length,
          totalIssues: issues.length,
        },
        tx,
      );

      const velocityPoints = completed.reduce(
        (sum, i) => sum + (i.estimate ?? 0),
        0,
      );

      return {
        sprint: closedSprint,
        completedIssues: completed.length,
        incompleteIssues: incomplete.length,
        ...(dto.incompleteIssuesAction === "MOVE_TO_BACKLOG"
          ? { movedToBacklog: incomplete.length }
          : {}),
        ...(dto.incompleteIssuesAction === "MOVE_TO_NEXT_SPRINT"
          ? { movedToSprint: incomplete.length }
          : {}),
        velocityPoints,
      };
    });

    this.logger.log('Sprint closed', {
      sprintId,
      boardId,
      completedIssues: result.completedIssues,
      incompleteIssues: result.incompleteIssues,
      incompleteIssuesAction: dto.incompleteIssuesAction,
    });

    if (userId) {
      const board = await this.boardsReader.findRefWithProjectName(boardId);
      if (board) {
        const memberIds = await this.projectMembersRepo.findMemberIds(
          board.projectId,
        );
        this.background.run(
          () =>
            this.notificationsDispatch.dispatch({
              type: NotificationType.SPRINT_CLOSED,
              actorId: userId,
              recipientIds: memberIds,
              projectId: board.projectId,
              payload: {
                sprintName: sprint.name,
                projectName: board.projectName,
                completedIssues: result.completedIssues,
                incompleteIssues: result.incompleteIssues,
              },
            }),
          (err) =>
            this.logger.error(
              `Notification dispatch failed: ${err.message}`,
              err.stack,
            ),
        );
      }
    }

    return result;
  }

  async remove(boardId: string, sprintId: string): Promise<void> {
    const sprint = await this.findOne(boardId, sprintId);
    if (sprint.status !== SprintStatus.PLANNING) {
      throw new ValidationError(
        ErrorCode.SPRINT_NOT_ACTIVE,
        "Only PLANNING sprints can be deleted",
      );
    }

    await this.txService.run(async (tx) => {
      await this.issuesRepo.clearSprint(sprintId, tx);
      await this.sprintsRepo.delete(sprintId, tx);
    });
    this.logger.log('Sprint deleted', { sprintId, boardId });
  }

  async addIssues(
    boardId: string,
    sprintId: string,
    issueIds: string[],
  ): Promise<AddSprintIssuesResult> {
    const sprint = await this.findOne(boardId, sprintId);
    const board = await this.boardsReader.findRefById(boardId);

    if (!board || board.type !== BoardType.SCRUM) {
      throw new ValidationError(
        ErrorCode.BOARD_TYPE_MISMATCH,
        "Sprint issues only for SCRUM boards",
      );
    }

    if (sprint.status === SprintStatus.CLOSED) {
      throw new ValidationError(
        ErrorCode.SPRINT_CLOSED,
        "Cannot add issues to a closed sprint",
      );
    }

    const added = await this.issuesRepo.assignToSprintForProject(
      issueIds,
      sprintId,
      board.projectId,
    );

    await this.recalculateCounters(sprintId);
    return { added };
  }

  async removeIssues(
    boardId: string,
    sprintId: string,
    issueIds: string[],
  ): Promise<RemoveSprintIssuesResult> {
    await this.findOne(boardId, sprintId);
    const removed = await this.issuesRepo.removeFromSprint(issueIds, sprintId);
    await this.recalculateCounters(sprintId);
    return { removed };
  }

  async getBacklog(
    boardId: string,
    query: { search?: string; page?: number; perPage?: number },
  ): Promise<BacklogResponse> {
    const board = await this.boardsReader.findRefById(boardId);
    if (!board) throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);

    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;

    const sprints = await this.sprintsRepo.findOpenSprintsWithCards(boardId);
    const backlog = await this.sprintsRepo.findBacklogCards(board.projectId, {
      ...(query.search ? { search: query.search } : {}),
      page,
      perPage,
    });

    return {
      sprints: sprints.map((s) => ({
        ...s.sprint,
        issues: s.issues,
        totalCount: s.totalCount,
        completedCount: s.completedCount,
        progress: s.progress,
      })),
      backlog: { issues: backlog },
    };
  }

  async getBurndown(boardId: string, sprintId: string): Promise<BurndownPoint[]> {
    const sprint = await this.findOne(boardId, sprintId);

    if (!sprint.startDate || !sprint.endDate) {
      throw new ValidationError(ErrorCode.SPRINT_NO_DATES);
    }

    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const now = new Date();
    const effectiveEnd = now < endDate ? now : endDate;

    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= effectiveEnd) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    const totalDays: Date[] = [];
    const totalCurrent = new Date(startDate);
    while (totalCurrent <= endDate) {
      totalDays.push(new Date(totalCurrent));
      totalCurrent.setDate(totalCurrent.getDate() + 1);
    }

    const totalIssues = await this.issuesRepo.countActiveBySprint(sprintId);
    const resolvedDates =
      await this.issuesRepo.findResolvedAtsBySprint(sprintId);

    // Remaining issues per elapsed day (actual burndown), keyed by ISO date.
    const actualByDate = new Map<string, number>();
    for (const date of days) {
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const resolved = resolvedDates.filter(
        (t) => t <= dayEnd.getTime(),
      ).length;
      actualByDate.set(
        date.toISOString().split("T")[0]!,
        totalIssues - resolved,
      );
    }

    // Flat point series the chart plots directly: `ideal` is the straight
    // burn line across every sprint day; `actual` tracks remaining issues up to
    // today and is null afterwards (the line stops at the current date).
    const points: BurndownPoint[] = totalDays.map((date, i) => {
      const iso = date.toISOString().split("T")[0]!;
      const ideal =
        totalDays.length > 1
          ? Math.round(totalIssues * (1 - i / (totalDays.length - 1)))
          : 0;
      const remaining = actualByDate.get(iso) ?? null;
      return {
        date: iso,
        ideal,
        actual: remaining,
        completed: remaining === null ? 0 : totalIssues - remaining,
      };
    });

    return points;
  }

  async getBacklogIssues(
    boardId: string,
    query: { search?: string; cursor?: string; pageSize?: number },
  ): Promise<CursorPaginatedResponse<BoardIssueCard>> {
    const board = await this.boardsReader.findRefById(boardId);
    if (!board) throw new NotFoundError(ErrorCode.BOARD_NOT_FOUND);

    return this.sprintsRepo.findBacklogCardsCursor(board.projectId, {
      ...(query.search ? { search: query.search } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      pageSize: query.pageSize ?? 25,
    });
  }

  private async recalculateCounters(sprintId: string) {
    const [total, completed] = await Promise.all([
      this.issuesRepo.countActiveBySprint(sprintId),
      this.issuesRepo.countResolvedBySprint(sprintId),
    ]);
    await this.sprintsRepo.update(sprintId, {
      totalIssues: total,
      completedIssues: completed,
    });
  }
}
