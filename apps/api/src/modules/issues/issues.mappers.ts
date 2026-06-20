import { Prisma } from '@prisma/client';
import type {
  IssueChildRef,
  IssueDetail,
  IssueListItem,
  IssueRef,
  IssueStatus,
  TiptapDoc,
  UserSummary,
  WorkflowStatus,
} from '@repo/shared/schemas';

export const LIST_INCLUDE = {
  reporter: { select: { id: true, name: true, email: true, avatarUrl: true } },
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  tags: { include: { tag: true } },
  sprint: { select: { id: true, name: true } },
  _count: { select: { comments: true, children: true } },
} as const;

export const CHILD_SELECT = {
  id: true,
  number: true,
  title: true,
  type: true,
  priority: true,
  statusId: true,
  assigneeId: true,
  resolvedAt: true,
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: { select: { comments: true, children: true } },
} as const;

export const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  children: {
    where: { deletedAt: null },
    select: CHILD_SELECT,
    orderBy: { number: 'asc' as const },
    take: 50,
  },
  parent: {
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      priority: true,
      statusId: true,
    },
  },
  watchers: {
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  },
  project: { select: { id: true, key: true, name: true, color: true } },
} as const;

export type IssueListRow = Prisma.IssueGetPayload<{ include: typeof LIST_INCLUDE }>;
export type IssueDetailRow = Prisma.IssueGetPayload<{ include: typeof DETAIL_INCLUDE }>;
export type IssueChildRow = IssueDetailRow['children'][number];
export type IssueParentRow = NonNullable<IssueDetailRow['parent']>;

function findStatus(
  statuses: WorkflowStatus[],
  statusId: string,
): IssueStatus | null {
  const s = statuses.find((x) => x.id === statusId);
  if (!s) return null;
  return { id: s.id, name: s.name, color: s.color, category: s.category };
}

export function toIssueListItem(
  row: IssueListRow,
  statuses: WorkflowStatus[],
): IssueListItem {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: findStatus(statuses, row.statusId),
    assignee: row.assignee,
    reporter: row.reporter,
    tags: row.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      color: t.tag.color,
    })),
    estimate: row.estimate,
    spent: row.spent,
    dueDate: row.dueDate?.toISOString() ?? null,
    commentsCount: row._count.comments,
    childrenCount: row._count.children,
    sprintId: row.sprintId,
    sprintName: row.sprint?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function toIssueRef(row: IssueParentRow, statuses: WorkflowStatus[]): IssueRef {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: findStatus(statuses, row.statusId),
  };
}

function toIssueChildRef(
  row: IssueChildRow,
  statuses: WorkflowStatus[],
): IssueChildRef {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: findStatus(statuses, row.statusId),
    assignee: row.assignee,
    commentsCount: row._count.comments,
    childrenCount: row._count.children,
  };
}

export function toIssueDetail(
  row: IssueDetailRow,
  statuses: WorkflowStatus[],
  userId: string,
): IssueDetail {
  const base = toIssueListItem(row, statuses);
  return {
    ...base,
    description: (row.description as TiptapDoc | null) ?? null,
    parent: row.parent ? toIssueRef(row.parent, statuses) : null,
    children: row.children.map((c) => toIssueChildRef(c, statuses)),
    watchers: row.watchers.map((w): UserSummary => w.user),
    isWatching: row.watchers.some((w) => w.userId === userId),
    project: row.project,
  };
}
