import { Injectable } from '@nestjs/common';
import type { IssueType } from '@prisma/client';
import type { BoardIssueRow } from '@/modules/boards/board-issue-card.mapper';
import {
  IssuesRepository,
  type IssueRef,
  type IssueTimerStartContext,
  type IssueTimerDisplay,
  type IssueDocContext,
} from './issues.repository';

/**
 * Read-only cross-module surface of the issues aggregate. Modules outside
 * issues/ inject this instead of IssuesRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class IssuesReader {
  constructor(private repo: IssuesRepository) {}

  findIssueRef(issueId: string): Promise<IssueRef | null> {
    return this.repo.findIssueRef(issueId);
  }

  findProjectIdById(issueId: string): Promise<string | null> {
    return this.repo.findProjectIdById(issueId);
  }

  findDocContext(issueId: string): Promise<IssueDocContext | null> {
    return this.repo.findDocContext(issueId);
  }

  findTagNames(issueId: string): Promise<string[]> {
    return this.repo.findTagNames(issueId);
  }

  findStartTimerContext(
    issueId: string,
  ): Promise<IssueTimerStartContext | null> {
    return this.repo.findStartTimerContext(issueId);
  }

  findTimerDisplay(issueId: string): Promise<IssueTimerDisplay | null> {
    return this.repo.findTimerDisplay(issueId);
  }

  findManyForBoardRaw(filters: {
    projectId: string;
    sprintId?: string | null;
    assigneeId?: string;
    search?: string;
  }): Promise<BoardIssueRow[]> {
    return this.repo.findManyForBoardRaw(filters);
  }

  findStoryEpicParents(
    projectId: string,
  ): Promise<
    Array<{ id: string; title: string; type: IssueType; number: number }>
  > {
    return this.repo.findStoryEpicParents(projectId);
  }

  findStatusSnapshotForAnalytics(
    projectId: string,
    until: Date,
  ): Promise<Array<{ id: string; statusId: string; createdAt: Date }>> {
    return this.repo.findStatusSnapshotForAnalytics(projectId, until);
  }

  findDueIssuesForNotification(
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
    return this.repo.findDueIssuesForNotification(after, before);
  }
}
