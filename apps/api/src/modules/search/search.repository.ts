import { Injectable } from '@nestjs/common';
import {
  CustomFieldType,
  IssueType,
  Prisma,
  Priority,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';
import type { TiptapDoc, WorkflowStatus } from '@repo/shared/schemas';
import type { CursorMeta } from '@repo/shared';

// ─── Indexing shape (ES document source) ─────────────────────

export interface IndexerCustomField {
  fieldId: string;
  name: string;
  type: CustomFieldType;
  value: unknown;
}

export interface IndexerProject {
  key: string;
  memberIds: string[];
  workflowStatuses: WorkflowStatus[];
}

/**
 * Domain shape consumed by the issue indexer to build an ES document.
 * Flatter than the underlying Prisma payload — the indexer service depends
 * only on this interface, not Prisma include paths.
 */
export interface IndexerIssue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: TiptapDoc | null;
  statusId: string;
  priority: Priority;
  type: IssueType;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  reporterId: string;
  estimate: number | null;
  spent: number | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  deletedAt: Date | null;
  project: IndexerProject;
  tagIds: string[];
  tagNames: string[];
  customFields: IndexerCustomField[];
  commentBodies: TiptapDoc[];
}

// ─── Search-hydration shape ──────────────────────────────────

/**
 * Row returned to the search service after ES gives us a list of issue ids.
 * The service decorates each row with a workflow-resolved status (looked
 * up in a sibling batch query) to produce the public `SearchIssue` shape.
 */
export interface SearchHydrationRow {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  priority: Priority;
  statusId: string;
  projectId: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  reporter: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  tags: Array<{
    id: string;
    projectId: string;
    name: string;
    color: string;
    createdAt: Date;
  }>;
  sprintName: string | null;
  project: {
    id: string;
    key: string;
    name: string;
    color: string | null;
  };
}

// ─── Mappers ─────────────────────────────────────────────────

const INDEXER_INCLUDE = {
  project: {
    include: {
      members: { select: { userId: true } },
      workflows: {
        where: { isDefault: true },
        include: { statuses: { orderBy: { ordinal: 'asc' } } },
      },
    },
  },
  assignee: { select: { name: true, email: true } },
  tags: { include: { tag: true } },
  customFieldValues: { include: { customField: true } },
  comments: { where: { deletedAt: null }, select: { body: true } },
} as const;

type IndexerIssueRow = Prisma.IssueGetPayload<{
  include: typeof INDEXER_INCLUDE;
}>;

function toIndexerIssue(row: IndexerIssueRow): IndexerIssue {
  const defaultWorkflow = row.project.workflows.find((w) => w.isDefault);
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    title: row.title,
    description: (row.description ?? null) as TiptapDoc | null,
    statusId: row.statusId,
    priority: row.priority,
    type: row.type,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.name ?? null,
    assigneeEmail: row.assignee?.email ?? null,
    reporterId: row.reporterId,
    estimate: row.estimate,
    spent: row.spent,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    deletedAt: row.deletedAt,
    project: {
      key: row.project.key,
      memberIds: row.project.members.map((m) => m.userId),
      workflowStatuses: defaultWorkflow ? defaultWorkflow.statuses : [],
    },
    tagIds: row.tags.map((t) => t.tag.id),
    tagNames: row.tags.map((t) => t.tag.name),
    customFields: row.customFieldValues.map((cfv) => ({
      fieldId: cfv.customFieldId,
      name: cfv.customField.name,
      type: cfv.customField.type,
      value: cfv.value,
    })),
    commentBodies: row.comments.map((c) => c.body as TiptapDoc),
  };
}

const HYDRATION_INCLUDE = {
  reporter: { select: { id: true, name: true, email: true, avatarUrl: true } },
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  tags: { include: { tag: true } },
  sprint: { select: { id: true, name: true } },
  project: { select: { id: true, key: true, name: true, color: true } },
} as const;

type SearchHydrationRowSource = Prisma.IssueGetPayload<{
  include: typeof HYDRATION_INCLUDE;
}>;

function toSearchHydrationRow(row: SearchHydrationRowSource): SearchHydrationRow {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    statusId: row.statusId,
    projectId: row.projectId,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assignee: row.assignee,
    reporter: row.reporter,
    tags: row.tags.map((t) => ({
      id: t.tag.id,
      projectId: t.tag.projectId,
      name: t.tag.name,
      color: t.tag.color,
      createdAt: t.tag.createdAt,
    })),
    sprintName: row.sprint?.name ?? null,
    project: row.project,
  };
}

/**
 * Data access for the search subsystem. Owns the heavy Prisma joins required
 * to build ES documents and hydrate search results — kept here (not in
 * IssuesRepository) because the shapes are search-specific denormalized
 * projections, not domain `Issue` reads.
 */
@Injectable()
export class SearchRepository {
  constructor(private prisma: PrismaService) {}

  /** Single-issue lookup for re-indexing; null if the row is gone. */
  async findForIndex(issueId: string): Promise<IndexerIssue | null> {
    const row = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: INDEXER_INCLUDE,
    });
    return row ? toIndexerIssue(row) : null;
  }

  /**
   * One batch of issues for project reindex, cursor-paginated over `id` asc.
   * Keyset paging stays stable even when rows are inserted/deleted between
   * batches (offset paging could skip or duplicate issues).
   */
  async findManyForIndex(
    projectId: string,
    cursor: string | undefined,
    pageSize: number,
  ): Promise<{ items: IndexerIssue[]; meta: CursorMeta }> {
    const cursorArgs = buildSimpleCursorArgs({ cursor, pageSize });

    const rows = await this.prisma.issue.findMany({
      where: { projectId },
      include: INDEXER_INCLUDE,
      orderBy: { id: 'asc' },
      ...cursorArgs,
    });

    const { items, meta } = buildSimpleCursorResult(rows, pageSize);
    return { items: items.map(toIndexerIssue), meta };
  }

  /**
   * Hydration query: fetches issues by ids, filtering out soft-deleted rows
   * that may still be stale in ES. Order is NOT preserved — the caller is
   * expected to reorder by ES hit order.
   */
  async findManyForSearchHydration(
    ids: string[],
  ): Promise<SearchHydrationRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.issue.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: HYDRATION_INCLUDE,
    });
    return rows.map(toSearchHydrationRow);
  }
}
