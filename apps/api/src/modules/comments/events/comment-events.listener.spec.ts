import { Test, TestingModule } from '@nestjs/testing';
import { CommentEventsListener } from './comment-events.listener';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { NotificationsDispatchService } from '@/modules/notifications/notifications-dispatch.service';
import { MentionsService } from '@/modules/mentions/mentions.service';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import type { Tx } from '@/common/repository/tx.types';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
} from './comment.events';

describe('CommentEventsListener', () => {
  const withMeta = <T extends object>(e: T): T & DomainEventMeta =>
    Object.assign(e, { eventId: 'evt-1' });

  let listener: CommentEventsListener;
  let issuesRepo: {
    addWatchersMany: jest.Mock;
    findWatcherUserIds: jest.Mock;
    findWatcherUserIdsIn: jest.Mock;
  };
  let activitiesService: { recordOne: jest.Mock };
  let indexerHooks: { onIssueChanged: jest.Mock };
  let notificationsDispatch: { dispatch: jest.Mock };
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
    notificationsDispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };
    issuesRepo = {
      addWatchersMany: jest.fn().mockResolvedValue(undefined),
      findWatcherUserIds: jest.fn().mockResolvedValue([]),
      findWatcherUserIdsIn: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentEventsListener,
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: IndexerHooksService, useValue: indexerHooks },
        { provide: NotificationsDispatchService, useValue: notificationsDispatch },
        { provide: MentionsService, useValue: new MentionsService() },
        { provide: EventIdempotencyService, useValue: idempotency },
      ],
    }).compile();

    listener = module.get(CommentEventsListener);
  });

  describe('handleCommentCreated', () => {
    it('should record activity and trigger indexer', async () => {
      const event = new CommentCreatedEvent(
        'c1', 'issue-1', 'proj-1', 'user-1',
        { type: 'doc', content: [] },
        'Issue Title', 'Test User',
      );

      await listener.handleCommentCreated(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'COMMENT_ADD', expect.objectContaining({ commentId: 'c1' }),
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'comment_added');
    });

    it('should dispatch notification to watchers', async () => {
      issuesRepo.findWatcherUserIds.mockResolvedValue(['user-2']);

      const event = new CommentCreatedEvent(
        'c1', 'issue-1', 'proj-1', 'user-1',
        { type: 'doc', content: [] },
        'Issue Title', 'Test User',
      );

      await listener.handleCommentCreated(withMeta(event));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COMMENT_ADD',
          recipientIds: ['user-2'],
        }),
      );
    });

    it('should auto-add mentioned users as watchers', async () => {
      const body = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-2', label: 'User Two' } },
            { type: 'mention', attrs: { id: 'user-3', label: 'User Three' } },
          ],
        }],
      };

      // user-2 is already a watcher, so only user-3 should be added
      issuesRepo.findWatcherUserIdsIn.mockResolvedValue(['user-2']);
      issuesRepo.findWatcherUserIds.mockResolvedValue(['user-1']);

      const event = new CommentCreatedEvent(
        'c1', 'issue-1', 'proj-1', 'user-1',
        body, 'Issue Title', 'Test User',
      );

      await listener.handleCommentCreated(withMeta(event));

      expect(issuesRepo.addWatchersMany).toHaveBeenCalledWith('issue-1', ['user-3']);
    });

    it('should dispatch MENTION notification for mentioned users', async () => {
      const body = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-2', label: 'User Two' } },
          ],
        }],
      };

      const event = new CommentCreatedEvent(
        'c1', 'issue-1', 'proj-1', 'user-1',
        body, 'Issue Title', 'Test User',
      );

      await listener.handleCommentCreated(withMeta(event));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'MENTION', recipientIds: ['user-2'] }),
      );
    });
  });

  describe('handleCommentUpdated', () => {
    it('should record activity and trigger indexer', async () => {
      const event = new CommentUpdatedEvent(
        'c1', 'issue-1', 'user-1',
        { type: 'doc', content: [] },
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] },
      );

      await listener.handleCommentUpdated(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'COMMENT_EDIT', { commentId: 'c1' },
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'comment_edited');
    });

    it('should add new mentions as watchers', async () => {
      const oldBody = { type: 'doc', content: [] };
      const newBody = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-5', label: 'User Five' } },
          ],
        }],
      };

      const event = new CommentUpdatedEvent('c1', 'issue-1', 'user-1', oldBody, newBody);

      await listener.handleCommentUpdated(withMeta(event));

      expect(issuesRepo.addWatchersMany).toHaveBeenCalledWith('issue-1', ['user-5']);
    });
  });

  describe('handleCommentDeleted', () => {
    it('should record activity and trigger indexer', async () => {
      const event = new CommentDeletedEvent('c1', 'issue-1', 'user-1');

      await listener.handleCommentDeleted(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'COMMENT_DELETE', { commentId: 'c1' },
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'comment_deleted');
    });
  });
});
