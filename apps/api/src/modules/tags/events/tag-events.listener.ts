import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityType } from '@prisma/client';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import { IssueTagAddedEvent, IssueTagRemovedEvent } from './tag.events';

/**
 * Re-indexes the issue in Elasticsearch and records the tag activity when a tag
 * is linked/unlinked. Without this, tag changes only hit Postgres and the issue's
 * ES document goes stale — so filtering issues by tag (`q=tag:...`) misses them.
 *
 * Delivery is at-least-once (outbox retries on failure): the activity write claims
 * an idempotency key derived from the outbox event id; the indexer re-index-by-id
 * is naturally idempotent. Errors propagate so the domain-events processor retries.
 */
@Injectable()
export class TagEventsListener {
  constructor(
    private activitiesService: ActivitiesService,
    private indexerHooks: IndexerHooksService,
    private idempotency: EventIdempotencyService,
  ) {}

  @OnEvent('issue.tag-added')
  async handleTagAdded(event: IssueTagAddedEvent & DomainEventMeta): Promise<void> {
    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.TAG_ADD,
        { tagId: event.tagId, tagName: event.tagName },
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'tag_added');
  }

  @OnEvent('issue.tag-removed')
  async handleTagRemoved(event: IssueTagRemovedEvent & DomainEventMeta): Promise<void> {
    await this.idempotency.runOnce(`${event.eventId}:activity`, async (tx) => {
      await this.activitiesService.recordOne(
        event.issueId,
        event.userId,
        ActivityType.TAG_REMOVE,
        { tagId: event.tagId, tagName: event.tagName },
        tx,
      );
    });

    await this.indexerHooks.onIssueChanged(event.issueId, 'tag_removed');
  }
}
