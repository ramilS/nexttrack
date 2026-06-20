import type { TiptapDoc, WorkflowStatus } from '@repo/shared/schemas';
import { ActivityEntry } from '@/modules/activities/activity-builder';

export class IssueCreatedEvent {
  constructor(
    public readonly issueId: string,
    public readonly projectId: string,
    public readonly projectKey: string,
    public readonly projectName: string,
    public readonly number: number,
    public readonly title: string,
    public readonly userId: string,
    public readonly description: TiptapDoc | null | undefined,
    public readonly assigneeId: string | null | undefined,
    public readonly reporterName: string | null | undefined,
  ) {}
}

export class IssueUpdatedEvent {
  constructor(
    public readonly issueId: string,
    public readonly projectId: string,
    public readonly projectKey: string,
    public readonly projectName: string,
    public readonly number: number,
    public readonly title: string,
    public readonly userId: string,
    public readonly activities: ActivityEntry[],
    public readonly changes: {
      assigneeId?: string | null;
      statusId?: string;
      description?: TiptapDoc | null;
    },
    public readonly previous: {
      assigneeId: string | null;
      statusId: string;
      resolvedAt: Date | null;
      description: TiptapDoc | null;
    },
    public readonly statuses: WorkflowStatus[],
    public readonly reporterName: string | null | undefined,
  ) {}
}

export class IssueDeletedEvent {
  constructor(
    public readonly issueId: string,
    public readonly userId: string,
  ) {}
}

export class IssueRestoredEvent {
  constructor(
    public readonly issueId: string,
    public readonly userId: string,
  ) {}
}

