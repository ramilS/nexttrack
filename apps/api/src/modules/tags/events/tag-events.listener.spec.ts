import { Test, TestingModule } from '@nestjs/testing';
import { TagEventsListener } from './tag-events.listener';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import type { Tx } from '@/common/repository/tx.types';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import { IssueTagAddedEvent, IssueTagRemovedEvent } from './tag.events';

describe('TagEventsListener', () => {
  const withMeta = <T extends object>(e: T): T & DomainEventMeta =>
    Object.assign(e, { eventId: 'evt-1' });

  let listener: TagEventsListener;
  let activitiesService: { recordOne: jest.Mock };
  let indexerHooks: { onIssueChanged: jest.Mock };
  let idempotency: { runOnce: jest.Mock };

  beforeEach(async () => {
    idempotency = {
      runOnce: jest.fn().mockImplementation(
        async (_key: string, work: (tx: Tx) => Promise<void>) => {
          await work({} as Tx);
          return true;
        },
      ),
    };
    activitiesService = { recordOne: jest.fn().mockResolvedValue(undefined) };
    indexerHooks = { onIssueChanged: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagEventsListener,
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: IndexerHooksService, useValue: indexerHooks },
        { provide: EventIdempotencyService, useValue: idempotency },
      ],
    }).compile();

    listener = module.get(TagEventsListener);
  });

  describe('handleTagAdded', () => {
    it('records a TAG_ADD activity and re-indexes the issue', async () => {
      const event = new IssueTagAddedEvent('issue-1', 'proj-1', 'user-1', 'tag-1', 'backend');

      await listener.handleTagAdded(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1',
        'user-1',
        'TAG_ADD',
        { tagId: 'tag-1', tagName: 'backend' },
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'tag_added');
    });

    it('uses the outbox event id as the activity idempotency key', async () => {
      const event = new IssueTagAddedEvent('issue-1', 'proj-1', 'user-1', 'tag-1', 'backend');

      await listener.handleTagAdded(withMeta(event));

      expect(idempotency.runOnce).toHaveBeenCalledWith('evt-1:activity', expect.any(Function));
    });
  });

  describe('handleTagRemoved', () => {
    it('records a TAG_REMOVE activity and re-indexes the issue', async () => {
      const event = new IssueTagRemovedEvent('issue-1', 'proj-1', 'user-1', 'tag-1', 'backend');

      await listener.handleTagRemoved(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1',
        'user-1',
        'TAG_REMOVE',
        { tagId: 'tag-1', tagName: 'backend' },
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'tag_removed');
    });
  });
});
