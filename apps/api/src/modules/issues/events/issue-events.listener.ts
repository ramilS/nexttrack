import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityType, NotificationType, WorkflowTrigger } from '@prisma/client';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { NotificationsDispatchService } from '@/modules/notifications/notifications-dispatch.service';
import { MentionsService } from '@/modules/mentions/mentions.service';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { WorkflowEngine } from '@/modules/workflow-automation/workflow-engine';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import {
  IssueCreatedEvent,
  IssueUpdatedEvent,
  IssueDeletedEvent,
  IssueRestoredEvent,
} from './issue.events';

/**
 * Delivery is at-least-once (outbox retries on listener failure), so every
 * handler must be idempotent: activities and notifications claim an
 * idempotency key derived from the outbox event id; watcher adds and indexer
 * jobs are naturally idempotent. Errors propagate to the domain-events
 * processor, which schedules the retry. The single exception is workflow
 * rules — their actions are arbitrary and not idempotent, so they stay
 * at-most-once behind a catch.
 */
@Injectable()
export class IssueEventsListener {
  private readonly logger = new Logger(IssueEventsListener.name);

  constructor(
    private issuesRepo: IssuesRepository,
    private activitiesService: ActivitiesService,
    private indexerHooks: IndexerHooksService,
    private notificationsDispatch: NotificationsDispatchService,
    private mentionsService: MentionsService,
    private workflowEngine: WorkflowEngine,
    private idempotency: EventIdempotencyService,
  ) {}

  private async runWorkflowRules(
    issueId: string,
    projectId: string,
    triggeredBy: string,
    trigger: WorkflowTrigger,
    extra: { oldStatusId?: string; newStatusId?: string } = {},
  ) {
    const issue = await this.issuesRepo.findForRuleEvaluation(issueId);
    if (!issue) return;

    await this.workflowEngine.executeRules(
      projectId,
      trigger,
      { issue, ...extra },
      { issueId, projectId, triggeredBy },
    );
  }

  @OnEvent('issue.created')
  async handleIssueCreated(
    event: IssueCreatedEvent & DomainEventMeta,
  ): Promise<void> {
    const issueKey = `${event.projectKey}-${event.number}`;

    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.ISSUE_CREATED,
        { number: event.number, title: event.title },
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'issue_created');

    if (event.assigneeId && event.assigneeId !== event.userId) {
      await this.notificationsDispatch.dispatch({
        type: NotificationType.ISSUE_ASSIGNED,
        actorId: event.userId,
        recipientIds: [event.assigneeId],
        issueId: event.issueId,
        projectId: event.projectId,
        payload: {
          issueKey,
          issueTitle: event.title,
          projectName: event.projectName,
          actorName: event.reporterName,
        },
        dedupeKey: `${event.eventId}:notif:${NotificationType.ISSUE_ASSIGNED}`,
      });
    }

    await this.runWorkflowRules(
      event.issueId,
      event.projectId,
      event.userId,
      WorkflowTrigger.ON_CREATE,
    ).catch((err) =>
      this.logger.error(`Workflow rules (ON_CREATE) failed: ${err.message}`, err.stack),
    );

    if (event.description) {
      const mentionedIds = this.mentionsService.extractMentionedUserIds(event.description)
        .filter((id) => id !== event.userId);

      if (mentionedIds.length > 0) {
        await this.issuesRepo.addWatchersMany(event.issueId, mentionedIds);

        const preview = this.mentionsService.extractPlainText(event.description);
        await this.notificationsDispatch.dispatch({
          type: NotificationType.MENTION,
          actorId: event.userId,
          recipientIds: mentionedIds,
          issueId: event.issueId,
          projectId: event.projectId,
          payload: {
            issueKey,
            issueTitle: event.title,
            actorName: event.reporterName,
            preview,
          },
          dedupeKey: `${event.eventId}:notif:${NotificationType.MENTION}`,
        });
      }
    }
  }

  @OnEvent('issue.updated')
  async handleIssueUpdated(
    event: IssueUpdatedEvent & DomainEventMeta,
  ): Promise<void> {
    const issueKey = `${event.projectKey}-${event.number}`;

    await this.idempotency.runOnce(`${event.eventId}:activity`, (tx) =>
      this.activitiesService.record(event.issueId, event.userId, event.activities, tx),
    );

    await this.indexerHooks.onIssueChanged(event.issueId, 'issue_updated');

    const watcherIds = await this.issuesRepo.findWatcherUserIds(event.issueId);

    if (event.changes.assigneeId && event.changes.assigneeId !== event.previous.assigneeId) {
      await this.notificationsDispatch.dispatch({
        type: NotificationType.ISSUE_ASSIGNED,
        actorId: event.userId,
        recipientIds: [event.changes.assigneeId],
        issueId: event.issueId,
        projectId: event.projectId,
        payload: {
          issueKey,
          issueTitle: event.title,
          projectName: event.projectName,
        },
        dedupeKey: `${event.eventId}:notif:${NotificationType.ISSUE_ASSIGNED}`,
      });
    }

    if (event.changes.statusId && event.changes.statusId !== event.previous.statusId) {
      await this.runWorkflowRules(
        event.issueId,
        event.projectId,
        event.userId,
        WorkflowTrigger.ON_STATUS_CHANGE,
        { oldStatusId: event.previous.statusId, newStatusId: event.changes.statusId },
      ).catch((err) =>
        this.logger.error(
          `Workflow rules (ON_STATUS_CHANGE) failed: ${err.message}`,
          err.stack,
        ),
      );

      const newStatus = event.statuses.find((s) => s.id === event.changes.statusId);
      if (newStatus?.isResolved && !event.previous.resolvedAt) {
        await this.notificationsDispatch.dispatch({
          type: NotificationType.ISSUE_RESOLVED,
          actorId: event.userId,
          recipientIds: watcherIds,
          issueId: event.issueId,
          projectId: event.projectId,
          payload: {
            issueKey,
            issueTitle: event.title,
            projectName: event.projectName,
            statusName: newStatus.name,
          },
          dedupeKey: `${event.eventId}:notif:${NotificationType.ISSUE_RESOLVED}`,
        });
      } else {
        await this.notificationsDispatch.dispatch({
          type: NotificationType.STATUS_CHANGE,
          actorId: event.userId,
          recipientIds: watcherIds,
          issueId: event.issueId,
          projectId: event.projectId,
          payload: {
            issueKey,
            issueTitle: event.title,
            projectName: event.projectName,
            statusName: newStatus?.name,
          },
          dedupeKey: `${event.eventId}:notif:${NotificationType.STATUS_CHANGE}`,
        });
      }
    }

    if (event.changes.description !== undefined) {
      const newMentionIds = this.mentionsService.findNewMentions(
        event.previous.description,
        event.changes.description,
      ).filter((id) => id !== event.userId);

      if (newMentionIds.length > 0) {
        await this.issuesRepo.addWatchersMany(event.issueId, newMentionIds);

        const preview = this.mentionsService.extractPlainText(event.changes.description);
        await this.notificationsDispatch.dispatch({
          type: NotificationType.MENTION,
          actorId: event.userId,
          recipientIds: newMentionIds,
          issueId: event.issueId,
          projectId: event.projectId,
          payload: {
            issueKey,
            issueTitle: event.title,
            actorName: event.reporterName,
            preview,
          },
          dedupeKey: `${event.eventId}:notif:${NotificationType.MENTION}`,
        });
      }
    }
  }

  @OnEvent('issue.deleted')
  async handleIssueDeleted(
    event: IssueDeletedEvent & DomainEventMeta,
  ): Promise<void> {
    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.ISSUE_DELETED,
        {},
        tx,
      );
    });

    await this.indexerHooks.onIssueDeleted(event.issueId);
  }

  @OnEvent('issue.restored')
  async handleIssueRestored(
    event: IssueRestoredEvent & DomainEventMeta,
  ): Promise<void> {
    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.ISSUE_RESTORED,
        {},
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'issue_restored');
  }
}
