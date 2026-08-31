import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppLogger } from '@/common/logging/app-logger';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import {
  IssueCreatedEvent,
  IssueDeletedEvent,
  IssueRestoredEvent,
  IssueUpdatedEvent,
} from '@/modules/issues/events/issue.events';
import { CommentCreatedEvent } from '@/modules/comments/events/comment.events';
import {
  SprintClosedEvent,
  SprintStartedEvent,
} from '@/modules/sprints/events/sprint.events';
import { RealtimeGateway } from '../realtime.gateway';

/**
 * Pushes domain events to the project room so open clients can invalidate
 * their caches instead of showing stale data until the next refetch.
 *
 * Broadcasting lives here rather than in the issues/comments/sprints
 * listeners for two reasons: those modules stay unaware of the socket layer,
 * and the whole client-facing event vocabulary is visible in one file next to
 * the gateway that owns the rooms.
 *
 * Delivery is at-least-once, so a client can see the same event twice. That is
 * harmless by construction: every handler on the other end is a cache
 * invalidation, which is idempotent.
 */
@Injectable()
export class RealtimeBroadcastListener {
  private readonly logger = new AppLogger(RealtimeBroadcastListener.name);

  constructor(private gateway: RealtimeGateway) {}

  /**
   * `Server.emit` is synchronous and returns a boolean — it cannot reject, and
   * a socket adapter hiccup must never fail the event and trigger an outbox
   * retry of the activity/notification side effects that already ran. Hence the
   * try/catch with a warning rather than propagation.
   */
  private broadcast(
    projectId: string,
    event: string,
    data: Record<string, unknown> = {},
  ): void {
    try {
      this.gateway.sendToProject(projectId, event, data);
    } catch (err) {
      this.logger.warn('Realtime broadcast failed', {
        projectId,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  @OnEvent('issue.created')
  onIssueCreated(event: IssueCreatedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'issue:created', {
      payload: { issueId: event.issueId },
      actorId: event.userId,
    });
  }

  @OnEvent('issue.updated')
  onIssueUpdated(event: IssueUpdatedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'issue:updated', {
      payload: { issueId: event.issueId },
      actorId: event.userId,
    });
  }

  @OnEvent('issue.deleted')
  onIssueDeleted(event: IssueDeletedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'issue:deleted', {
      payload: { issueId: event.issueId },
      actorId: event.userId,
    });
  }

  @OnEvent('issue.restored')
  onIssueRestored(event: IssueRestoredEvent & DomainEventMeta): void {
    // A restore puts the issue back into every list, so clients need the same
    // invalidation an update triggers.
    this.broadcast(event.projectId, 'issue:updated', {
      payload: { issueId: event.issueId },
      actorId: event.userId,
    });
  }

  @OnEvent('comment.created')
  onCommentCreated(event: CommentCreatedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'comment:created', {
      payload: { issueId: event.issueId },
      actorId: event.userId,
    });
  }

  @OnEvent('sprint.started')
  onSprintStarted(event: SprintStartedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'sprint:started', {
      payload: { sprintId: event.sprintId, name: event.name },
      actorId: event.userId,
    });
  }

  @OnEvent('sprint.closed')
  onSprintClosed(event: SprintClosedEvent & DomainEventMeta): void {
    this.broadcast(event.projectId, 'sprint:closed', {
      payload: { sprintId: event.sprintId, name: event.name },
      actorId: event.userId ?? null,
    });
  }
}
