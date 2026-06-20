import { ActivityType, Issue as PrismaIssue } from '@prisma/client';
import type { WorkflowStatus } from '@repo/shared/schemas';

export interface ActivityEntry {
  type: ActivityType;
  payload: Record<string, unknown>;
}

interface UserRef {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}

interface TagRef {
  id: string;
  name?: string;
  color?: string;
}

interface BuildActivitiesContext {
  workflow?: { statuses: WorkflowStatus[] };
  users?: Map<string, UserRef>;
  tags?: Map<string, TagRef>;
}

export function buildActivities(
  oldIssue: PrismaIssue,
  newData: Record<string, unknown>,
  context?: BuildActivitiesContext,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (newData.title !== undefined && newData.title !== oldIssue.title) {
    entries.push({
      type: ActivityType.TITLE_CHANGE,
      payload: { from: oldIssue.title, to: newData.title },
    });
  }

  if (newData.statusId !== undefined && newData.statusId !== oldIssue.statusId) {
    const statuses: WorkflowStatus[] = context?.workflow
      ? context.workflow.statuses
      : [];
    const fromStatus = statuses.find((s) => s.id === oldIssue.statusId);
    const toStatus = statuses.find((s) => s.id === newData.statusId);
    entries.push({
      type: ActivityType.STATUS_CHANGE,
      payload: {
        from: fromStatus ? { id: fromStatus.id, name: fromStatus.name, color: fromStatus.color } : null,
        to: toStatus ? { id: toStatus.id, name: toStatus.name, color: toStatus.color } : null,
      },
    });
  }

  if (newData.assigneeId !== undefined && newData.assigneeId !== oldIssue.assigneeId) {
    const newAssigneeId = newData.assigneeId as string | null | undefined;
    entries.push({
      type: ActivityType.ASSIGNEE_CHANGE,
      payload: {
        from: oldIssue.assigneeId
          ? context?.users?.get(oldIssue.assigneeId) ?? { id: oldIssue.assigneeId }
          : null,
        to: newAssigneeId
          ? context?.users?.get(newAssigneeId) ?? { id: newAssigneeId }
          : null,
      },
    });
  }

  if (newData.priority !== undefined && newData.priority !== oldIssue.priority) {
    entries.push({
      type: ActivityType.PRIORITY_CHANGE,
      payload: { from: oldIssue.priority, to: newData.priority },
    });
  }

  if (newData.type !== undefined && newData.type !== oldIssue.type) {
    entries.push({
      type: ActivityType.TYPE_CHANGE,
      payload: { from: oldIssue.type, to: newData.type },
    });
  }

  if (newData.description !== undefined) {
    entries.push({
      type: ActivityType.DESCRIPTION_CHANGE,
      payload: {},
    });
  }

  if (newData.estimate !== undefined && newData.estimate !== oldIssue.estimate) {
    entries.push({
      type: ActivityType.ESTIMATE_CHANGE,
      payload: { from: oldIssue.estimate, to: newData.estimate },
    });
  }

  if (newData.dueDate !== undefined) {
    const oldDate = oldIssue.dueDate?.toISOString() ?? null;
    const rawNew = newData.dueDate as string | Date | null | undefined;
    const newDate = rawNew ? new Date(rawNew).toISOString() : null;
    if (oldDate !== newDate) {
      entries.push({
        type: ActivityType.DUE_DATE_CHANGE,
        payload: { from: oldDate, to: newDate },
      });
    }
  }

  if (newData.parentId !== undefined && newData.parentId !== oldIssue.parentId) {
    entries.push({
      type: ActivityType.PARENT_CHANGE,
      payload: { from: oldIssue.parentId, to: newData.parentId },
    });
  }

  return entries;
}
