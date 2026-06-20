import { Injectable } from '@nestjs/common';
import { Prisma, SprintStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';
import type { Sprint } from '@repo/shared/schemas';
import {
  BOARD_ISSUE_INCLUDE,
  toBoardIssueCard,
} from '@/modules/boards/board-issue-card.mapper';
import type { BoardIssueCard } from '@repo/shared/schemas';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';

export interface SprintCreateInput {
  boardId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  ordinal: number;
}

export interface SprintPatch {
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: SprintStatus;
  startedAt?: string;
  closedAt?: string;
  totalIssues?: number;
  completedIssues?: number;
}

type SprintRow = {
  id: string;
  boardId: string;
  name: string;
  goal: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: SprintStatus;
  ordinal: number;
  totalIssues: number;
  completedIssues: number;
  startedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSprint(row: SprintRow): Sprint {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    goal: row.goal,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    status: row.status,
    ordinal: row.ordinal,
    totalIssues: row.totalIssues,
    completedIssues: row.completedIssues,
    startedAt: row.startedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function patchToData(patch: SprintPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.goal !== undefined) data.goal = patch.goal;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.totalIssues !== undefined) data.totalIssues = patch.totalIssues;
  if (patch.completedIssues !== undefined) data.completedIssues = patch.completedIssues;
  if (patch.startDate !== undefined) {
    data.startDate = patch.startDate ? new Date(patch.startDate) : null;
  }
  if (patch.endDate !== undefined) {
    data.endDate = patch.endDate ? new Date(patch.endDate) : null;
  }
  if (patch.startedAt !== undefined) data.startedAt = new Date(patch.startedAt);
  if (patch.closedAt !== undefined) data.closedAt = new Date(patch.closedAt);
  return data;
}

export interface SprintBacklogGroup {
  sprint: Sprint;
  issues: BoardIssueCard[];
  totalCount: number;
  completedCount: number;
  progress: number;
}

@Injectable()
export class SprintsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findPage(
    boardId: string,
    options: { status?: SprintStatus; page: number; perPage: number },
  ): Promise<{ items: Sprint[]; total: number }> {
    const where: Prisma.SprintWhereInput = { boardId };
    if (options.status) where.status = options.status;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sprint.findMany({
        where,
        orderBy: { ordinal: 'asc' },
        skip: (options.page - 1) * options.perPage,
        take: options.perPage,
      }),
      this.prisma.sprint.count({ where }),
    ]);

    return { items: rows.map(toSprint), total };
  }

  async findById(sprintId: string, boardId?: string, tx?: Tx): Promise<Sprint | null> {
    const row = await this.db(tx).sprint.findFirst({
      where: { id: sprintId, ...(boardId ? { boardId } : {}) },
    });
    return row ? toSprint(row) : null;
  }

  async findActiveOnBoard(boardId: string): Promise<Sprint | null> {
    const row = await this.prisma.sprint.findFirst({
      where: { boardId, status: SprintStatus.ACTIVE },
    });
    return row ? toSprint(row) : null;
  }

  /**
   * Returns the ACTIVE sprint for a board, or the first PLANNING sprint
   * (ordered by `ordinal`) when there's no active one. Used to pick a
   * default sprint for board views.
   */
  async findActiveOrFirstPlanning(boardId: string): Promise<Sprint | null> {
    const active = await this.findActiveOnBoard(boardId);
    if (active) return active;
    const planning = await this.prisma.sprint.findFirst({
      where: { boardId, status: SprintStatus.PLANNING },
      orderBy: { ordinal: 'asc' },
    });
    return planning ? toSprint(planning) : null;
  }

  /**
   * Closed sprints with their non-deleted issues (estimate + statusId only),
   * ordered newest closed first. Used by board velocity analytics.
   */
  async findClosedWithEstimates(
    boardId: string,
    limit: number,
  ): Promise<Array<{
    id: string;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    issues: Array<{ estimate: number | null; statusId: string }>;
  }>> {
    return this.prisma.sprint.findMany({
      where: { boardId, status: SprintStatus.CLOSED },
      orderBy: { closedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        issues: {
          where: { deletedAt: null },
          select: { estimate: true, statusId: true },
        },
      },
    });
  }

  /** Scoped lookup: only returns the sprint if it belongs to the given board. */
  async findByIdInBoard(sprintId: string, boardId: string): Promise<Sprint | null> {
    const row = await this.prisma.sprint.findFirst({
      where: { id: sprintId, boardId },
    });
    return row ? toSprint(row) : null;
  }

  /**
   * Recomputes a sprint's `totalIssues` / `completedIssues` from the
   * current issue counts, all inside a tx so we can run it after each
   * move on the board.
   */
  async updateCounters(
    sprintId: string,
    counters: { totalIssues: number; completedIssues: number },
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).sprint.update({
      where: { id: sprintId },
      data: counters,
    });
  }

  async maxOrdinal(boardId: string): Promise<number> {
    const result = await this.prisma.sprint.aggregate({
      where: { boardId },
      _max: { ordinal: true },
    });
    return result._max.ordinal ?? -1;
  }

  async create(input: SprintCreateInput, tx?: Tx): Promise<Sprint> {
    const row = await this.db(tx).sprint.create({
      data: {
        boardId: input.boardId,
        name: input.name,
        goal: input.goal,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        status: SprintStatus.PLANNING,
        ordinal: input.ordinal,
      },
    });
    return toSprint(row);
  }

  async update(sprintId: string, patch: SprintPatch, tx?: Tx): Promise<Sprint> {
    const row = await this.db(tx).sprint.update({
      where: { id: sprintId },
      data: patchToData(patch),
    });
    return toSprint(row);
  }

  async delete(sprintId: string, tx?: Tx): Promise<void> {
    await this.db(tx).sprint.delete({ where: { id: sprintId } });
  }

  // ─── Backlog / cards (use board's domain mapper) ──────────────

  async findOpenSprintsWithCards(boardId: string): Promise<SprintBacklogGroup[]> {
    const rows = await this.prisma.sprint.findMany({
      where: { boardId, status: { in: [SprintStatus.PLANNING, SprintStatus.ACTIVE] } },
      orderBy: { ordinal: 'asc' },
      include: {
        issues: {
          where: { deletedAt: null },
          include: BOARD_ISSUE_INCLUDE,
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return rows.map((row) => {
      const { issues, ...sprintFields } = row;
      const sprint = toSprint(sprintFields);
      return {
        sprint,
        issues: issues.map(toBoardIssueCard),
        totalCount: sprint.totalIssues,
        completedCount: sprint.completedIssues,
        progress:
          sprint.totalIssues > 0
            ? Math.round((sprint.completedIssues / sprint.totalIssues) * 100)
            : 0,
      };
    });
  }

  async findBacklogCards(
    projectId: string,
    options: { search?: string; page: number; perPage: number },
  ): Promise<BoardIssueCard[]> {
    const where: Prisma.IssueWhereInput = {
      projectId,
      sprintId: null,
      resolvedAt: null,
      deletedAt: null,
    };
    if (options.search) {
      where.title = { contains: options.search, mode: 'insensitive' };
    }

    const rows = await this.prisma.issue.findMany({
      where,
      include: BOARD_ISSUE_INCLUDE,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      skip: (options.page - 1) * options.perPage,
      take: options.perPage,
    });

    return rows.map(toBoardIssueCard);
  }

  async findBacklogCardsCursor(
    projectId: string,
    options: { search?: string; cursor?: string; pageSize: number },
  ) {
    const cursorArgs = buildSimpleCursorArgs({
      cursor: options.cursor,
      pageSize: options.pageSize,
    });

    const where: Prisma.IssueWhereInput = {
      projectId,
      sprintId: null,
      resolvedAt: null,
      deletedAt: null,
    };
    if (options.search) {
      where.title = { contains: options.search, mode: 'insensitive' };
    }

    const rows = await this.prisma.issue.findMany({
      where,
      include: BOARD_ISSUE_INCLUDE,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      ...cursorArgs,
    });

    const { items, meta } = buildSimpleCursorResult(rows, options.pageSize);
    return { items: items.map(toBoardIssueCard), meta };
  }
}
