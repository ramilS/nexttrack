import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityType, NotificationType } from '@prisma/client';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { NotificationsDispatchService } from '@/modules/notifications/notifications-dispatch.service';
import { MentionsService } from '@/modules/mentions/mentions.service';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
} from './comment.events';

/**
 * Delivery is at-least-once (outbox retries on listener failure), so every
 * handler is idempotent: activities and notifications claim an idempotency
 * key derived from the outbox event id; watcher adds and indexer jobs are
 * naturally idempotent. Errors propagate to the domain-events processor,
 * which schedules the retry.
 */
@Injectable()
export class CommentEventsListener {
  constructor(
    private issuesRepo: IssuesRepository,
    private activitiesService: ActivitiesService,
    private indexerHooks: IndexerHooksService,
    private notificationsDispatch: NotificationsDispatchService,
    private mentionsService: MentionsService,
    private idempotency: EventIdempotencyService,
  ) {}

  @OnEvent('comment.created')
  async handleCommentCreated(
    event: CommentCreatedEvent & DomainEventMeta,
  ): Promise<void> {
    const preview = this.mentionsService.extractPlainText(event.body);

    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.COMMENT_ADD,
        { commentId: event.commentId, preview },
        tx,
      );
    });

    // Auto-add mentioned users as watchers
    const mentionedIds = this.mentionsService.extractMentionedUserIds(event.body);
    if (mentionedIds.length > 0) {
      const existingIds = await this.issuesRepo.findWatcherUserIdsIn(
        event.issueId,
        mentionedIds,
      );
      const existingSet = new Set(existingIds);
      const newWatchers = mentionedIds.filter((id) => !existingSet.has(id));
      if (newWatchers.length > 0) {
        await this.issuesRepo.addWatchersMany(event.issueId, newWatchers);
      }
    }

    await this.indexerHooks.onIssueChanged(event.issueId, 'comment_added');

    // Notify watchers about the new comment
    const watcherIds = await this.issuesRepo.findWatcherUserIds(event.issueId);

    await this.notificationsDispatch.dispatch({
      type: ActivityType.COMMENT_ADD,
      actorId: event.userId,
      recipientIds: watcherIds,
      issueId: event.issueId,
      projectId: event.projectId,
      payload: {
        issueKey: `${event.projectId}`,
        issueTitle: event.issueTitle,
        actorName: event.authorName,
        preview,
      },
      groupKey: `comment:${event.issueId}`,
      dedupeKey: `${event.eventId}:notif:${NotificationType.COMMENT_ADD}`,
    });

    // Notify mentioned users specifically
    if (mentionedIds.length > 0) {
      await this.notificationsDispatch.dispatch({
        type: NotificationType.MENTION,
        actorId: event.userId,
        recipientIds: mentionedIds,
        issueId: event.issueId,
        projectId: event.projectId,
        payload: {
          issueTitle: event.issueTitle,
          actorName: event.authorName,
          preview,
        },
        dedupeKey: `${event.eventId}:notif:${NotificationType.MENTION}`,
      });
    }
  }

  @OnEvent('comment.updated')
  async handleCommentUpdated(
    event: CommentUpdatedEvent & DomainEventMeta,
  ): Promise<void> {
    // Add new mentions as watchers
    const newMentions = this.mentionsService.findNewMentions(
      event.oldBody,
      event.newBody,
    );
    if (newMentions.length > 0) {
      await this.issuesRepo.addWatchersMany(event.issueId, newMentions);
    }

    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.COMMENT_EDIT,
        { commentId: event.commentId },
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'comment_edited');
  }

  @OnEvent('comment.deleted')
  async handleCommentDeleted(
    event: CommentDeletedEvent & DomainEventMeta,
  ): Promise<void> {
    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.COMMENT_DELETE,
        { commentId: event.commentId },
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'comment_deleted');
  }
}
