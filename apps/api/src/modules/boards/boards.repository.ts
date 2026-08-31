import { Injectable } from '@nestjs/common';
import { BoardType, Prisma, SwimlaneBy } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Board, BoardColumn, BoardSummary } from '@repo/shared/schemas';

export type { BoardType, SwimlaneBy };

export interface BoardRef {
  id: string;
  projectId: string;
  type: BoardType;
}

export interface BoardWithProjectName extends BoardRef {
  projectName: string;
}

/**
 * Full board row, used by the service for in-memory operations (column
 * parsing, WIP checks, autoCloseOnDone gate) without leaking the Prisma
 * type. Mirrors PrismaAgileBoard but is explicit.
 */
export interface BoardEntity {
  id: string;
  projectId: string;
  name: string;
  type: BoardType;
  columns: BoardColumn[];
  swimlaneBy: SwimlaneBy;
  filterQuery: string | null;
  autoCloseOnDone: boolean;
  isDefault: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

type BoardRow = {
  id: string;
  projectId: string;
  name: string;
  type: BoardType;
  columns: unknown;
  swimlaneBy: SwimlaneBy;
  filterQuery: string | null;
  autoCloseOnDone: boolean;
  isDefault: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

function getColumns(value: unknown): BoardColumn[] {
  return Array.isArray(value) ? (value as BoardColumn[]) : [];
}

function toEntity(row: BoardRow): BoardEntity {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    columns: getColumns(row.columns),
    swimlaneBy: row.swimlaneBy,
    filterQuery: row.filterQuery,
    autoCloseOnDone: row.autoCloseOnDone,
    isDefault: row.isDefault,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toBoard(entity: BoardEntity): Board {
  return {
    id: entity.id,
    projectId: entity.projectId,
    name: entity.name,
    type: entity.type,
    columns: entity.columns,
    swimlaneBy: entity.swimlaneBy,
    filterQuery: entity.filterQuery,
    autoCloseOnDone: entity.autoCloseOnDone,
    isDefault: entity.isDefault,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export { toBoard };

export interface BoardCreateInput {
  projectId: string;
  name: string;
  type: BoardType;
  columns: BoardColumn[];
  swimlaneBy: SwimlaneBy;
  filterQuery: string | null;
  autoCloseOnDone: boolean;
  isDefault: boolean;
  createdById: string;
}

export interface BoardPatch {
  name?: string;
  swimlaneBy?: SwimlaneBy;
  filterQuery?: string | null;
  autoCloseOnDone?: boolean;
}

@Injectable()
export class BoardsRepository {
  constructor(private prisma: PrismaService) {}

  async findRefById(boardId: string): Promise<BoardRef | null> {
    const row = await this.prisma.agileBoard.findUnique({
      where: { id: boardId },
      select: { id: true, projectId: true, type: true },
    });
    return row ? { id: row.id, projectId: row.projectId, type: row.type } : null;
  }

  async findRefWithProjectName(boardId: string): Promise<BoardWithProjectName | null> {
    const row = await this.prisma.agileBoard.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        projectId: true,
        type: true,
        project: { select: { name: true } },
      },
    });
    return row
      ? {
          id: row.id,
          projectId: row.projectId,
          type: row.type,
          projectName: row.project.name,
        }
      : null;
  }

  async findAllByProject(projectId: string): Promise<Board[]> {
    const rows = await this.prisma.agileBoard.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => toBoard(toEntity(r)));
  }

  /**
   * Boards of every given project, shaped for the cross-project switcher.
   *
   * Intentionally unpaginated: the caller passes only the projects the user
   * belongs to, so the row count is bounded by that membership, and the picker
   * needs the whole list at once to search and group it client-side.
   */
  async findSummariesByProjects(projectIds: string[]): Promise<BoardSummary[]> {
    if (projectIds.length === 0) return [];

    const rows = await this.prisma.agileBoard.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        id: true,
        name: true,
        type: true,
        project: { select: { id: true, key: true, name: true } },
      },
      orderBy: [{ project: { key: 'asc' } }, { createdAt: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      project: row.project,
    }));
  }

  async findEntityInProject(
    projectId: string,
    boardId: string,
  ): Promise<BoardEntity | null> {
    const row = await this.prisma.agileBoard.findFirst({
      where: { id: boardId, projectId },
    });
    return row ? toEntity(row) : null;
  }

  /**
   * Board lookup by its natural key within a project. Board names are not
   * unique in the schema — this exists so the importer can recognise a board a
   * previous attempt already created, not to enforce uniqueness.
   */
  async findEntityByNameInProject(
    projectId: string,
    name: string,
  ): Promise<BoardEntity | null> {
    const row = await this.prisma.agileBoard.findFirst({
      where: { projectId, name: { equals: name, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
    return row ? toEntity(row) : null;
  }

  async countByProject(projectId: string): Promise<number> {
    return this.prisma.agileBoard.count({ where: { projectId } });
  }

  async create(input: BoardCreateInput): Promise<BoardEntity> {
    const row = await this.prisma.agileBoard.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        columns: asJson(input.columns),
        swimlaneBy: input.swimlaneBy,
        filterQuery: input.filterQuery,
        autoCloseOnDone: input.autoCloseOnDone,
        isDefault: input.isDefault,
        createdById: input.createdById,
      },
    });
    return toEntity(row);
  }

  async update(boardId: string, patch: BoardPatch): Promise<BoardEntity> {
    const data: Prisma.AgileBoardUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.swimlaneBy !== undefined) data.swimlaneBy = patch.swimlaneBy;
    if (patch.filterQuery !== undefined) data.filterQuery = patch.filterQuery;
    if (patch.autoCloseOnDone !== undefined) data.autoCloseOnDone = patch.autoCloseOnDone;

    const row = await this.prisma.agileBoard.update({ where: { id: boardId }, data });
    return toEntity(row);
  }

  async updateColumns(boardId: string, columns: BoardColumn[]): Promise<BoardEntity> {
    const row = await this.prisma.agileBoard.update({
      where: { id: boardId },
      data: { columns: asJson(columns) },
    });
    return toEntity(row);
  }

  async setIsDefault(boardId: string, isDefault: boolean): Promise<void> {
    await this.prisma.agileBoard.update({
      where: { id: boardId },
      data: { isDefault },
    });
  }

  /**
   * Atomically clears `isDefault` on the project's current default board (if
   * any) and sets it on the target board. Mirrors `WorkflowsRepository`.
   */
  async setDefaultAtomic(projectId: string, boardId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.agileBoard.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.agileBoard.update({
        where: { id: boardId },
        data: { isDefault: true },
      }),
    ]);
  }

  async delete(boardId: string): Promise<void> {
    await this.prisma.agileBoard.delete({ where: { id: boardId } });
  }
}
