import { Injectable } from '@nestjs/common';
import { IssueType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type {
  BoardIssueCard,
  TiptapDoc,
  UserSummary,
  CreateIssueParsed,
  ListIssuesQueryParsed,
} from '@repo/shared/schemas';
import {
  toIssueUpdateData,
  buildListWhere,
  type BoardIssueMovePatch,
  type IssueUpdatePatch,
  type IssueBulkUpdatePatch,
  type IssueListFilter,
} from './issues-query.builder';
import {
  BOARD_ISSUE_INCLUDE,
  toBoardIssueCard,
  BoardIssueRow,
} from '@/modules/boards/board-issue-card.mapper';
import {
  LIST_INCLUDE,
  DETAIL_INCLUDE,
  IssueListRow,
  IssueDetailRow,
} from './issues.mappers';
import {
  buildKeysetWhere,
  buildKeysetCursorResult,
} from '@/common/utils/cursor-paginate';
import type { CursorMeta } from '@repo/shared';

export interface IssueDocContext {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  description: TiptapDoc | null;
  projectId: string;
}

export interface IssueRef {
  id: string;
  projectId: string;
  title: string;
}

export interface SprintIssueStats {
  id: string;
  resolvedAt: string | null;
  estimate: number | null;
}

export interface IssueCreateContext {
  id: string;
  projectArchivedAt: Date | null;
}

export interface IssueUpdateContext {
  id: string;
  number: number;
  title: string;
  statusId: string;
  assigneeId: string | null;
  description: TiptapDoc | null;
  resolvedAt: Date | null;
  parentId: string | null;
  sprintId: string | null;
  deletedAt: Date | null;
  priority: import('@prisma/client').Priority;
  type: IssueType;
  estimate: number | null;
  dueDate: Date | null;
}

export interface IssueTimerStartContext {
  id: string;
  projectId: string;
}

export interface IssueTimerDisplay {
  id: string;
  number: number;
  title: string;
  projectKey: string;
}

/**
 * Pilot IssuesRepository. Initially exposes only the cross-module
 * read helpers needed by other services (tags, comments). The full
 * issues data access will move here in a follow-up pass.
 */
@Injectable()
export class IssuesRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the `projectId` of an active (non-deleted) issue, or `null`
   * if the issue doesn't exist. Used by sibling services to scope
   * cross-entity operations to a project.
   */
  async findProjectIdById(issueId: string): Promise<string | null> {
    const row = await this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: { projectId: true },
    });
    return row?.projectId ?? null;
  }

  /**
   * Lightweight reference to an active issue — id, project, title.
   * Useful for cross-module operations that need to display or
   * propagate basic issue context (e.g. activity feeds, notifications).
   */
  async findIssueRef(issueId: string): Promise<IssueRef | null> {
    const row = await this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: { id: true, projectId: true, title: true },
    });
    return row ?? null;
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  // ─── Sprint-related issue queries ────────────────────────────

  /** Count of active issues currently assigned to a sprint. */
  async countActiveBySprint(sprintId: string, tx?: Tx): Promise<number> {
    return this.db(tx).issue.count({
      where: { sprintId, deletedAt: null },
    });
  }

  /** Count of active issues in a sprint that are already resolved. */
  async countResolvedBySprint(sprintId: string, tx?: Tx): Promise<number> {
    return this.db(tx).issue.count({
      where: { sprintId, deletedAt: null, resolvedAt: { not: null } },
    });
  }

  /**
   * Resolved-at timestamps (epoch ms) of active resolved issues in a sprint.
   * Loads only the resolved subset's single column so a burndown can bucket
   * them per day in memory — one query instead of a COUNT per day.
   */
  async findResolvedAtsBySprint(sprintId: string, tx?: Tx): Promise<number[]> {
    const rows = await this.db(tx).issue.findMany({
      where: { sprintId, deletedAt: null, resolvedAt: { not: null } },
      select: { resolvedAt: true },
    });
    return rows.map((r) => r.resolvedAt!.getTime());
  }

  /** Lightweight stats for all active issues in a sprint (for close calculations). */
  async findSprintIssueStats(sprintId: string, tx?: Tx): Promise<SprintIssueStats[]> {
    const rows = await this.db(tx).issue.findMany({
      where: { sprintId, deletedAt: null },
      select: { id: true, resolvedAt: true, estimate: true },
    });
    return rows.map((r) => ({
      id: r.id,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      estimate: r.estimate,
    }));
  }

  /**
   * Bulk assign issues to a sprint. Only updates issues in the given
   * project that aren't soft-deleted. Returns the number of rows affected.
   */
  async assignToSprintForProject(
    issueIds: string[],
    sprintId: string,
    projectId: string,
    tx?: Tx,
  ): Promise<number> {
    const result = await this.db(tx).issue.updateMany({
      where: { id: { in: issueIds }, projectId, deletedAt: null },
      data: { sprintId, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Bulk remove issues from a sprint (matching by id + current sprintId). */
  async removeFromSprint(
    issueIds: string[],
    sprintId: string,
    tx?: Tx,
  ): Promise<number> {
    const result = await this.db(tx).issue.updateMany({
      where: { id: { in: issueIds }, sprintId, deletedAt: null },
      data: { sprintId: null, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Move a set of issues from their current sprint to a different one. */
  async moveToSprint(issueIds: string[], targetSprintId: string | null, tx?: Tx): Promise<void> {
    await this.db(tx).issue.updateMany({
      where: { id: { in: issueIds } },
      data: { sprintId: targetSprintId, version: { increment: 1 } },
    });
  }

  /** Clear sprintId for every issue currently in the given sprint. */
  async clearSprint(sprintId: string, tx?: Tx): Promise<void> {
    await this.db(tx).issue.updateMany({
      where: { sprintId },
      data: { sprintId: null, version: { increment: 1 } },
    });
  }

  // ─── Time-tracking helpers ───────────────────────────────────

  /**
   * Returns the create-eligibility context for an issue: the issue id and
   * whether the owning project is archived. Resolves to `null` if the
   * issue is missing or soft-deleted.
   */
  async findCreateContext(issueId: string): Promise<IssueCreateContext | null> {
    const row = await this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: {
        id: true,
        project: { select: { archivedAt: true } },
      },
    });
    if (!row) return null;
    return { id: row.id, projectArchivedAt: row.project.archivedAt };
  }

  /** Tag names attached to an issue (for the ai-docs trigger-tag gate). */
  async findTagNames(issueId: string): Promise<string[]> {
    const rows = await this.prisma.issueTag.findMany({
      where: { issueId },
      select: { tag: { select: { name: true } } },
    });
    return rows.map((r) => r.tag.name);
  }

  /** Content an AI doc-update needs from a resolved source issue. */
  async findDocContext(issueId: string): Promise<IssueDocContext | null> {
    const row = await this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        description: true,
        projectId: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      type: row.type,
      description: (row.description as TiptapDoc | null) ?? null,
      projectId: row.projectId,
    };
  }

  /**
   * Minimal context needed to start a timer: issue id + project id,
   * scoped to active (non-deleted) issues.
   */
  async findStartTimerContext(
    issueId: string,
  ): Promise<IssueTimerStartContext | null> {
    const row = await this.prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    return row ?? null;
  }

  /** Display context for an active timer (id/number/title/projectKey). */
  async findTimerDisplay(issueId: string): Promise<IssueTimerDisplay | null> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        number: true,
        title: true,
        project: { select: { key: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      projectKey: row.project.key,
    };
  }

  /** Updates the cached `spent` total on an issue. */
  async updateSpent(issueId: string, spent: number): Promise<void> {
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { spent },
    });
  }

  /**
   * Bumps the issue's `updatedAt` to the current time. Used by side-channel
   * mutations (custom-field value changes) that should mark the issue dirty
   * even though no scalar fields were modified.
   */
  async touchUpdatedAt(issueId: string): Promise<void> {
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { updatedAt: new Date() },
    });
  }

  /**
   * Applies a workflow-automation patch — the small set of fields a rule
   * action may set. Kept narrow on purpose: automation rules cannot set
   * fields outside this list (title, description, parent, etc.).
   */
  async applyAutomationPatch(
    issueId: string,
    patch: {
      statusId?: string;
      assigneeId?: string | null;
      priority?: import('@prisma/client').Priority;
      type?: IssueType;
      dueDate?: Date | null;
      sprintId?: string | null;
    },
  ): Promise<void> {
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { ...patch, version: { increment: 1 } },
    });
  }

  // ─── Workflow-status migration helpers ───────────────────────

  /**
   * Counts active issues in a project whose status is one of the supplied
   * IDs. Used during workflow updates to detect issues that would be
   * orphaned by removing a status.
   */
  async countByProjectAndStatuses(
    projectId: string,
    statusIds: string[],
  ): Promise<number> {
    if (statusIds.length === 0) return 0;
    return this.prisma.issue.count({
      where: { projectId, statusId: { in: statusIds }, deletedAt: null },
    });
  }

  /**
   * Returns a small sample of issues blocking a workflow status removal, so
   * the client can surface them in the conflict error.
   */
  async findBlockedByStatuses(
    projectId: string,
    statusIds: string[],
    limit: number,
  ): Promise<Array<{ id: string; number: number; title: string; statusId: string }>> {
    if (statusIds.length === 0) return [];
    return this.prisma.issue.findMany({
      where: { projectId, statusId: { in: statusIds }, deletedAt: null },
      select: { id: true, number: true, title: true, statusId: true },
      take: limit,
    });
  }

  /**
   * Reassigns every active issue currently on `fromStatusId` (within the
   * project) to `toStatusId`. If `resolved` is `true` we also stamp
   * `resolvedAt` — if `false` we clear it. Accepts a tx so the migration
   * can run together with the workflow update.
   */
  async migrateStatusBatch(
    projectId: string,
    fromStatusId: string,
    toStatusId: string,
    resolved: boolean,
    tx?: Tx,
  ): Promise<number> {
    const result = await this.db(tx).issue.updateMany({
      where: { projectId, statusId: fromStatusId, deletedAt: null },
      data: {
        statusId: toStatusId,
        resolvedAt: resolved ? new Date() : null,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  // ─── Board-oriented helpers ──────────────────────────────────

  /**
   * Loads a single issue, raw shape. Returns `null` if the issue is missing
   * OR soft-deleted. Used by board move-issue flow as a pre-check.
   */
  async findMoveContext(issueId: string): Promise<{
    id: string;
    projectId: string;
    statusId: string;
    sprintId: string | null;
    parentId: string | null;
  } | null> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        projectId: true,
        statusId: true,
        sprintId: true,
        parentId: true,
        deletedAt: true,
      },
    });
    if (!row || row.deletedAt) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      statusId: row.statusId,
      sprintId: row.sprintId,
      parentId: row.parentId,
    };
  }

  /** Returns active issues matching board filters in BoardIssueCard form. */
  async findManyForBoard(filters: {
    projectId: string;
    sprintId?: string | null;
    assigneeId?: string;
    search?: string;
  }): Promise<BoardIssueCard[]> {
    const where: Prisma.IssueWhereInput = {
      projectId: filters.projectId,
      deletedAt: null,
    };
    if (filters.sprintId !== undefined) where.sprintId = filters.sprintId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

    const rows = await this.prisma.issue.findMany({
      where,
      include: BOARD_ISSUE_INCLUDE,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toBoardIssueCard);
  }

  /** Loads issues with raw rows (BoardIssueRow shape) for swimlane grouping. */
  async findManyForBoardRaw(filters: {
    projectId: string;
    sprintId?: string | null;
    assigneeId?: string;
    search?: string;
  }): Promise<BoardIssueRow[]> {
    const where: Prisma.IssueWhereInput = {
      projectId: filters.projectId,
      deletedAt: null,
    };
    if (filters.sprintId !== undefined) where.sprintId = filters.sprintId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

    return this.prisma.issue.findMany({
      where,
      include: BOARD_ISSUE_INCLUDE,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Story/Epic issues that act as parents for board epic-swimlane mode. */
  async findStoryEpicParents(
    projectId: string,
  ): Promise<Array<{ id: string; title: string; type: IssueType; number: number }>> {
    return this.prisma.issue.findMany({
      where: {
        projectId,
        deletedAt: null,
        type: { in: [IssueType.STORY, IssueType.EPIC] },
      },
      select: { id: true, title: true, type: true, number: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Counts active issues that would land in the given column (set of status
   * IDs) — optionally within a sprint and excluding a specific issue id. Used
   * by the WIP-limit check during board move.
   */
  async countInStatuses(
    projectId: string,
    statusIds: string[],
    options: { excludeId?: string; sprintId?: string | null },
    tx?: Tx,
  ): Promise<number> {
    const where: Prisma.IssueWhereInput = {
      projectId,
      statusId: { in: statusIds },
      deletedAt: null,
    };
    if (options.excludeId) where.id = { not: options.excludeId };
    if (options.sprintId !== undefined && options.sprintId !== null) {
      where.sprintId = options.sprintId;
    }
    return this.db(tx).issue.count({ where });
  }

  /** Lookup parent project for the parent-change validation. */
  async findParentScope(
    parentId: string,
    tx?: Tx,
  ): Promise<{ id: string; projectId: string } | null> {
    const row = await this.db(tx).issue.findUnique({
      where: { id: parentId },
      select: { id: true, projectId: true },
    });
    return row ?? null;
  }

  /**
   * The ancestor chain of an issue (itself first, then parent, grandparent, …)
   * in a single recursive CTE instead of one query per level. Capped at
   * `maxDepth` rows, so a pre-existing cycle in the data cannot loop forever.
   * Used for cycle/depth validation during parent changes.
   */
  async findAncestorChain(
    issueId: string,
    maxDepth: number,
    tx?: Tx,
  ): Promise<string[]> {
    const rows = await this.db(tx).$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, 1 AS depth
        FROM issues
        WHERE id = ${issueId}
        UNION ALL
        SELECT i.id, i.parent_id, a.depth + 1
        FROM issues i
        JOIN ancestors a ON i.id = a.parent_id
        WHERE a.depth < ${maxDepth}
      )
      SELECT id FROM ancestors ORDER BY depth
    `;
    return rows.map((r) => r.id);
  }

  /** Updates an issue and returns the refreshed BoardIssueCard. */
  async updateForBoard(
    issueId: string,
    patch: BoardIssueMovePatch,
    tx?: Tx,
  ): Promise<BoardIssueCard> {
    const data: Prisma.IssueUncheckedUpdateInput = {};
    if (patch.statusId !== undefined) data.statusId = patch.statusId;
    if (patch.resolvedAt !== undefined) data.resolvedAt = patch.resolvedAt;
    if (patch.sprintId !== undefined) data.sprintId = patch.sprintId;
    if (patch.parentId !== undefined) data.parentId = patch.parentId;

    const row = await this.db(tx).issue.update({
      where: { id: issueId },
      data: { ...data, version: { increment: 1 } },
      include: BOARD_ISSUE_INCLUDE,
    });
    return toBoardIssueCard(row);
  }

  // ─── Parent cascade helpers ──────────────────────────────────

  /** Minimal parent shape for cascade traversal. */
  async findParentCascadeContext(
    issueId: string,
    tx?: Tx,
  ): Promise<{ id: string; statusId: string; parentId: string | null } | null> {
    const row = await this.db(tx).issue.findUnique({
      where: { id: issueId },
      select: { id: true, statusId: true, parentId: true },
    });
    return row ?? null;
  }

  /** Counts non-done siblings under a parent — drives the auto-close cascade. */
  async countNonDoneSiblings(
    parentId: string,
    nonDoneStatusIds: string[],
    tx?: Tx,
  ): Promise<number> {
    if (nonDoneStatusIds.length === 0) return 0;
    return this.db(tx).issue.count({
      where: {
        parentId,
        deletedAt: null,
        statusId: { in: nonDoneStatusIds },
      },
    });
  }

  /** Sets statusId + resolvedAt on a single issue. Used by cascade auto-close. */
  async setStatusForCascade(
    issueId: string,
    statusId: string,
    resolvedAt: Date | null,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).issue.update({
      where: { id: issueId },
      data: { statusId, resolvedAt, version: { increment: 1 } },
    });
  }

  /** All non-deleted issues' status snapshot. Used by CFD analytics. */
  async findStatusSnapshotForAnalytics(
    projectId: string,
    until: Date,
  ): Promise<Array<{ id: string; statusId: string; createdAt: Date }>> {
    return this.prisma.issue.findMany({
      where: { projectId, deletedAt: null, createdAt: { lte: until } },
      select: { id: true, statusId: true, createdAt: true },
    });
  }

  // ─── Full CRUD ───────────────────────────────────────────────

  /**
   * Atomically increments a project's issue counter and returns the new
   * number. The `RETURNING` clause makes it a single round-trip.
   */
  async getNextNumber(projectId: string): Promise<number> {
    const result = await this.prisma.$queryRaw<{ lastNumber: number }[]>`
      UPDATE project_issue_counters
      SET last_number = last_number + 1
      WHERE project_id = ${projectId}
      RETURNING last_number AS "lastNumber"
    `;
    return result[0].lastNumber;
  }

  /** Paginated, filtered issue list. Builds the WHERE from the parsed query. */
  async findPage(
    filter: IssueListFilter,
    options: { sortBy: ListIssuesQueryParsed['sortBy']; sortOrder: 'asc' | 'desc'; pageSize: number; cursor?: string },
  ): Promise<{ items: IssueListRow[]; meta: CursorMeta }> {
    const where = buildListWhere(filter);
    const keysetWhere = buildKeysetWhere({
      cursor: options.cursor,
      pageSize: options.pageSize,
      sortField: options.sortBy,
      sortOrder: options.sortOrder,
    });
    const composedWhere = keysetWhere ? { AND: [where, keysetWhere] } : where;

    const rows = await this.prisma.issue.findMany({
      where: composedWhere,
      include: LIST_INCLUDE,
      orderBy: [{ [options.sortBy]: options.sortOrder }, { id: options.sortOrder }],
      take: options.pageSize + 1,
    });
    return buildKeysetCursorResult(rows, options.pageSize, options.sortBy);
  }

  /** Issue + full detail relations, scoped to a project, only if active. */
  async findDetailByNumber(
    projectId: string,
    issueNumber: number,
  ): Promise<IssueDetailRow | null> {
    return this.prisma.issue.findFirst({
      where: { projectId, number: issueNumber, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
  }

  /** Minimal lookup by project + number; used as a pre-check before updates. */
  async findEntityByNumber(
    projectId: string,
    issueNumber: number,
  ): Promise<IssueUpdateContext | null> {
    const row = await this.prisma.issue.findFirst({
      where: { projectId, number: issueNumber, deletedAt: null },
      select: {
        id: true,
        number: true,
        title: true,
        statusId: true,
        assigneeId: true,
        description: true,
        resolvedAt: true,
        parentId: true,
        sprintId: true,
        deletedAt: true,
        priority: true,
        type: true,
        estimate: true,
        dueDate: true,
      },
    });
    if (!row) return null;
    return { ...row, description: (row.description as TiptapDoc | null) ?? null };
  }

  /** Same as `findEntityByNumber` but for soft-deleted issues (restore flow). */
  async findDeletedByNumber(
    projectId: string,
    issueNumber: number,
  ): Promise<{ id: string } | null> {
    return this.prisma.issue.findFirst({
      where: { projectId, number: issueNumber, deletedAt: { not: null } },
      select: { id: true },
    });
  }

  async findByIdAny(issueId: string): Promise<{
    id: string;
    projectId: string;
    parentId: string | null;
    deletedAt: Date | null;
  } | null> {
    return this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, parentId: true, deletedAt: true },
    });
  }

  /**
   * Verifies that a candidate parent issue exists, is active, and lives in
   * the given project. Used by both create and setParent flows.
   */
  async findParentInProject(
    projectId: string,
    parentId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.issue.findFirst({
      where: { id: parentId, projectId, deletedAt: null },
      select: { id: true },
    });
  }

  /** Full create with detail relations included. */
  async createWithDetails(
    input: {
      projectId: string;
      number: number;
      title: string;
      description: TiptapDoc | null;
      type: CreateIssueParsed['type'];
      priority: CreateIssueParsed['priority'];
      statusId: string;
      reporterId: string;
      assigneeId: string | null;
      parentId: string | null;
      sprintId: string | null;
      dueDate: string | null;
      estimate: number | null;
      resolved: boolean;
      tagIds: string[];
    },
    tx?: Tx,
  ): Promise<IssueDetailRow> {
    return this.db(tx).issue.create({
      data: {
        number: input.number,
        title: input.title,
        description: input.description ? asJson(input.description) : undefined,
        type: input.type,
        priority: input.priority,
        statusId: input.statusId,
        projectId: input.projectId,
        reporterId: input.reporterId,
        assigneeId: input.assigneeId,
        parentId: input.parentId,
        sprintId: input.sprintId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimate: input.estimate,
        resolvedAt: input.resolved ? new Date() : undefined,
        tags: input.tagIds.length
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        watchers: { create: { userId: input.reporterId } },
      },
      include: DETAIL_INCLUDE,
    });
  }

  /** Update an issue with the given Prisma patch and return the detail. */
  async updateWithDetails(
    issueId: string,
    data: Prisma.IssueUncheckedUpdateInput,
    tx?: Tx,
  ): Promise<IssueDetailRow> {
    return this.db(tx).issue.update({
      where: { id: issueId },
      data: { ...data, version: { increment: 1 } },
      include: DETAIL_INCLUDE,
    });
  }

  /**
   * Replace tag links and update the issue inside a single tx.
   *
   * When `expectedVersion` is given the update is conditional (optimistic
   * locking): a concurrent modification makes the claim miss and the method
   * returns `null` without touching tags.
   */
  async updateWithTagsTx(
    issueId: string,
    patch: IssueUpdatePatch,
    tagIds: string[] | undefined,
    tx: Tx,
    expectedVersion?: number,
  ): Promise<IssueDetailRow | null> {
    const data = { ...toIssueUpdateData(patch), version: { increment: 1 } };

    if (expectedVersion !== undefined) {
      const claimed = await tx.issue.updateMany({
        where: { id: issueId, version: expectedVersion },
        data,
      });
      if (claimed.count === 0) return null;
    } else {
      await tx.issue.update({ where: { id: issueId }, data });
    }

    if (tagIds !== undefined) {
      await tx.issueTag.deleteMany({ where: { issueId } });
      if (tagIds.length > 0) {
        await tx.issueTag.createMany({
          data: tagIds.map((tagId) => ({ issueId, tagId })),
        });
      }
    }

    return tx.issue.findUniqueOrThrow({
      where: { id: issueId },
      include: DETAIL_INCLUDE,
    });
  }

  async softDelete(issueId: string, deletedBy: string, tx?: Tx): Promise<void> {
    await this.db(tx).issue.update({
      where: { id: issueId },
      data: { deletedAt: new Date(), deletedById: deletedBy, version: { increment: 1 } },
    });
  }

  async restoreWithDetails(issueId: string, tx?: Tx): Promise<IssueDetailRow> {
    return this.db(tx).issue.update({
      where: { id: issueId },
      data: { deletedAt: null, deletedById: null, version: { increment: 1 } },
      include: DETAIL_INCLUDE,
    });
  }

  async findChildrenList(parentId: string): Promise<IssueListRow[]> {
    return this.prisma.issue.findMany({
      where: { parentId, deletedAt: null },
      include: LIST_INCLUDE,
      orderBy: { number: 'asc' },
    });
  }

  /** Lookup active issues by id (project-scoped) — used for bulk validation. */
  async findManyForBulk(
    projectId: string,
    issueIds: string[],
  ): Promise<
    Array<{
      id: string;
      statusId: string;
      type: string;
      priority: string;
      assigneeId: string | null;
      tagIds: string[];
    }>
  > {
    if (issueIds.length === 0) return [];
    const rows = await this.prisma.issue.findMany({
      where: { id: { in: issueIds }, projectId, deletedAt: null },
      select: {
        id: true,
        statusId: true,
        type: true,
        priority: true,
        assigneeId: true,
        tags: { select: { tagId: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      statusId: r.statusId,
      type: r.type,
      priority: r.priority,
      assigneeId: r.assigneeId,
      tagIds: r.tags.map((t) => t.tagId),
    }));
  }

  async bulkUpdate(
    issueIds: string[],
    data: IssueBulkUpdatePatch,
    tx?: Tx,
  ): Promise<number> {
    if (issueIds.length === 0 || Object.keys(data).length === 0) return 0;
    const result = await this.db(tx).issue.updateMany({
      where: { id: { in: issueIds } },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count;
  }

  // ─── Watchers ────────────────────────────────────────────────

  async addWatcher(issueId: string, userId: string): Promise<void> {
    await this.prisma.issueWatcher.upsert({
      where: { issueId_userId: { issueId, userId } },
      create: { issueId, userId },
      update: {},
    });
  }

  async removeWatcher(issueId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.issueWatcher.findUnique({
      where: { issueId_userId: { issueId, userId } },
    });
    if (!row) return false;
    await this.prisma.issueWatcher.delete({
      where: { issueId_userId: { issueId, userId } },
    });
    return true;
  }

  async findDueIssuesForNotification(
    after: Date,
    before: Date,
  ): Promise<
    {
      id: string;
      number: number;
      title: string;
      dueDate: Date | null;
      assigneeId: string | null;
      projectId: string;
      projectKey: string;
      projectName: string;
      watcherUserIds: string[];
    }[]
  > {
    const rows = await this.prisma.issue.findMany({
      where: {
        dueDate: { gte: after, lte: before },
        resolvedAt: null,
        deletedAt: null,
      },
      include: {
        watchers: { select: { userId: true } },
        project: { select: { id: true, key: true, name: true } },
      },
    });
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      dueDate: i.dueDate,
      assigneeId: i.assigneeId,
      projectId: i.projectId,
      projectKey: i.project.key,
      projectName: i.project.name,
      watcherUserIds: i.watchers.map((w) => w.userId),
    }));
  }

  /**
   * Loads the minimal fields needed to evaluate workflow-automation
   * conditions: type, priority, status, assignee, and tag IDs. Returns
   * null if the issue was hard-deleted between the event and the listener.
   */
  async findForRuleEvaluation(issueId: string): Promise<{
    type: string;
    priority: string;
    statusId: string;
    assigneeId: string | null;
    tagIds: string[];
  } | null> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        type: true,
        priority: true,
        statusId: true,
        assigneeId: true,
        tags: { select: { tagId: true } },
      },
    });
    if (!row) return null;
    return {
      type: row.type,
      priority: row.priority,
      statusId: row.statusId,
      assigneeId: row.assigneeId,
      tagIds: row.tags.map((t) => t.tagId),
    };
  }

  async addWatchersMany(issueId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.issueWatcher.createMany({
      data: userIds.map((userId) => ({ issueId, userId })),
      skipDuplicates: true,
    });
  }

  async findWatcherUserIds(issueId: string): Promise<string[]> {
    const rows = await this.prisma.issueWatcher.findMany({
      where: { issueId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async findWatcherUserIdsIn(
    issueId: string,
    candidateUserIds: string[],
  ): Promise<string[]> {
    if (candidateUserIds.length === 0) return [];
    const rows = await this.prisma.issueWatcher.findMany({
      where: { issueId, userId: { in: candidateUserIds } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async findWatchers(issueId: string): Promise<UserSummary[]> {
    const rows = await this.prisma.issueWatcher.findMany({
      where: { issueId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return rows.map((r) => r.user);
  }

  // ─── Sprint validation ────────────────────────────────────────

  /**
   * Returns the sprint's board project id, used to confirm a sprint belongs
   * to the project being updated. `null` if the sprint doesn't exist.
   */
  async findSprintBoardProjectId(sprintId: string): Promise<string | null> {
    const row = await this.prisma.sprint.findFirst({
      where: { id: sprintId },
      select: { board: { select: { projectId: true } } },
    });
    return row?.board.projectId ?? null;
  }
}
