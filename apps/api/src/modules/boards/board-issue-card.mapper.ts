import { Prisma } from '@prisma/client';
import type { BoardIssueCard, TiptapDoc } from '@repo/shared/schemas';

/**
 * Prisma include shape used to fetch an Issue with everything needed for the
 * `BoardIssueCard` mapper. Exported so other modules (sprints, issues repo,
 * boards repo) can fetch issues in the same shape and reuse `toBoardIssueCard`.
 */
export const BOARD_ISSUE_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  parent: { select: { id: true, title: true, type: true } },
  tags: { include: { tag: true } },
  _count: { select: { comments: true, children: true } },
  children: {
    where: { deletedAt: null, resolvedAt: { not: null } },
    select: { id: true },
  },
  attachments: { where: { deletedAt: null }, select: { id: true }, take: 1 },
} as const;

export type BoardIssueRow = Prisma.IssueGetPayload<{
  include: typeof BOARD_ISSUE_INCLUDE;
}>;

function extractDescriptionPreview(description: unknown): string | null {
  if (!description) return null;
  try {
    const doc =
      typeof description === 'string'
        ? (JSON.parse(description) as TiptapDoc)
        : (description as TiptapDoc);
    const texts: string[] = [];
    const extract = (node: TiptapDoc): void => {
      if (typeof node.text === 'string') texts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(extract);
    };
    extract(doc);
    const plain = texts.join(' ').trim();
    return plain.length > 0 ? plain.slice(0, 120) : null;
  } catch {
    return null;
  }
}

export function toBoardIssueCard(issue: BoardIssueRow): BoardIssueCard {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    descriptionPreview: extractDescriptionPreview(issue.description),
    type: issue.type,
    priority: issue.priority,
    statusId: issue.statusId,
    projectId: issue.projectId,
    assigneeId: issue.assigneeId ?? null,
    parentId: issue.parentId ?? null,
    assignee: issue.assignee,
    tags: issue.tags.map((t) => ({
      id: t.tag.id,
      projectId: t.tag.projectId,
      name: t.tag.name,
      color: t.tag.color,
      createdAt: t.tag.createdAt.toISOString(),
    })),
    estimate: issue.estimate ?? null,
    spent: issue.spent,
    dueDate: issue.dueDate?.toISOString() ?? null,
    isOverdue: issue.dueDate
      ? new Date(issue.dueDate) < new Date() && !issue.resolvedAt
      : false,
    commentsCount: issue._count.comments,
    hasAttachments: issue.attachments.length > 0,
    childrenCount: issue._count.children,
    completedChildrenCount: issue.children.length,
    sprintId: issue.sprintId ?? null,
  };
}
