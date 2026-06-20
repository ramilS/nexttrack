import { Test, TestingModule } from '@nestjs/testing';
import { ActivityType } from '@prisma/client';
import { ActivityEntry } from '@/modules/activities/activity-builder';
import { IssueEventsListener } from './issue-events.listener';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { NotificationsDispatchService } from '@/modules/notifications/notifications-dispatch.service';
import { MentionsService } from '@/modules/mentions/mentions.service';
import { WorkflowEngine } from '@/modules/workflow-automation/workflow-engine';
import { EventIdempotencyService } from '@/common/idempotency/event-idempotency.service';
import type { Tx } from '@/common/repository/tx.types';
import type { DomainEventMeta } from '@/modules/outbox/domain-event-publisher';
import {
  IssueCreatedEvent,
  IssueUpdatedEvent,
  IssueDeletedEvent,
  IssueRestoredEvent,
} from './issue.events';

describe('IssueEventsListener', () => {
  const withMeta = <T extends object>(e: T): T & DomainEventMeta =>
    Object.assign(e, { eventId: 'evt-1' });

  let listener: IssueEventsListener;
  let issuesRepo: {
    addWatchersMany: jest.Mock;
    findWatcherUserIds: jest.Mock;
    findForRuleEvaluation: jest.Mock;
  };
  let activitiesService: { recordOne: jest.Mock; record: jest.Mock };
  let indexerHooks: { onIssueChanged: jest.Mock; onIssueDeleted: jest.Mock };
  let notificationsDispatch: { dispatch: jest.Mock };
  let idempotency: { runOnce: jest.Mock };
  let workflowEngine: { executeRules: jest.Mock };

  beforeEach(async () => {
    idempotency = {
      runOnce: jest.fn().mockImplementation(
        async (_key: string, work: (tx: Tx) => Promise<void>) => {
          await work({} as Tx);
          return true;
        },
      ),
    };
    activitiesService = { recordOne: jest.fn().mockResolvedValue(undefined), record: jest.fn().mockResolvedValue(undefined) };
    indexerHooks = { onIssueChanged: jest.fn().mockResolvedValue(undefined), onIssueDeleted: jest.fn().mockResolvedValue(undefined) };
    notificationsDispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };
    issuesRepo = {
      addWatchersMany: jest.fn().mockResolvedValue(undefined),
      findWatcherUserIds: jest.fn().mockResolvedValue([]),
      findForRuleEvaluation: jest.fn().mockResolvedValue(null),
    };
    workflowEngine = { executeRules: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueEventsListener,
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: IndexerHooksService, useValue: indexerHooks },
        { provide: NotificationsDispatchService, useValue: notificationsDispatch },
        { provide: MentionsService, useValue: new MentionsService() },
        { provide: WorkflowEngine, useValue: workflowEngine },
        { provide: EventIdempotencyService, useValue: idempotency },
      ],
    }).compile();

    listener = module.get(IssueEventsListener);
  });

  describe('handleIssueCreated', () => {
    it('should record activity and trigger indexer', async () => {
      const event = new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        undefined, undefined, 'Test User',
      );

      await listener.handleIssueCreated(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'ISSUE_CREATED', { number: 1, title: 'New Issue' },
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'issue_created');
    });

    it('should notify assignee on creation', async () => {
      const event = new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        undefined, 'assignee-1', 'Test User',
      );

      await listener.handleIssueCreated(withMeta(event));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ISSUE_ASSIGNED',
          recipientIds: ['assignee-1'],
        }),
      );
    });

    it('should not notify when assignee is the creator', async () => {
      const event = new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        undefined, 'user-1', 'Test User',
      );

      await listener.handleIssueCreated(withMeta(event));

      expect(notificationsDispatch.dispatch).not.toHaveBeenCalled();
    });

    it('should add mentioned users as watchers', async () => {
      const description = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-2', label: 'User Two' } },
          ],
        }],
      };

      const event = new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        description, undefined, 'Test User',
      );

      await listener.handleIssueCreated(withMeta(event));

      expect(issuesRepo.addWatchersMany).toHaveBeenCalledWith('issue-1', ['user-2']);
      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MENTION',
          recipientIds: ['user-2'],
        }),
      );
    });

    it('should not create watchers for self-mentions', async () => {
      const description = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-1', label: 'Test' } },
          ],
        }],
      };

      const event = new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        description, undefined, 'Test User',
      );

      await listener.handleIssueCreated(withMeta(event));

      expect(issuesRepo.addWatchersMany).not.toHaveBeenCalled();
      expect(notificationsDispatch.dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'MENTION' }),
      );
    });
  });

  describe('handleIssueUpdated', () => {
    const statuses = [
      { id: 'open', name: 'Open', isInitial: true, isResolved: false, color: '#ccc', category: 'UNSTARTED' as const, ordinal: 0 },
      { id: 'done', name: 'Done', isInitial: false, isResolved: true, color: '#0f0', category: 'DONE' as const, ordinal: 1 },
    ];

    it('should record activities and trigger indexer', async () => {
      const activities: ActivityEntry[] = [
        { type: ActivityType.STATUS_CHANGE, payload: { from: 'open', to: 'done' } },
      ];
      const event = new IssueUpdatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'Test Issue', 'user-1',
        activities,
        { statusId: 'done' },
        { assigneeId: null, statusId: 'open', resolvedAt: null, description: null },
        statuses,
        'Test User',
      );
      issuesRepo.findWatcherUserIds.mockResolvedValue([]);

      await listener.handleIssueUpdated(withMeta(event));

      expect(activitiesService.record).toHaveBeenCalledWith('issue-1', 'user-1', activities, expect.anything());
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'issue_updated');
    });

    it('should notify on assignee change', async () => {
      const event = new IssueUpdatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'Test Issue', 'user-1',
        [],
        { assigneeId: 'user-2' },
        { assigneeId: null, statusId: 'open', resolvedAt: null, description: null },
        statuses,
        'Test User',
      );
      issuesRepo.findWatcherUserIds.mockResolvedValue([]);

      await listener.handleIssueUpdated(withMeta(event));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ISSUE_ASSIGNED',
          recipientIds: ['user-2'],
        }),
      );
    });

    it('should notify watchers on status resolved', async () => {
      const event = new IssueUpdatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'Test Issue', 'user-1',
        [],
        { statusId: 'done' },
        { assigneeId: null, statusId: 'open', resolvedAt: null, description: null },
        statuses,
        'Test User',
      );
      issuesRepo.findWatcherUserIds.mockResolvedValue(['user-3']);

      await listener.handleIssueUpdated(withMeta(event));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ISSUE_RESOLVED',
          recipientIds: ['user-3'],
        }),
      );
    });

    it('should process new mentions in description update', async () => {
      const oldDescription = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old' }] }],
      };
      const newDescription = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'user-3', label: 'User Three' } },
          ],
        }],
      };

      const event = new IssueUpdatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'Test Issue', 'user-1',
        [],
        { description: newDescription },
        { assigneeId: null, statusId: 'open', resolvedAt: null, description: oldDescription },
        statuses,
        'Test User',
      );
      issuesRepo.findWatcherUserIds.mockResolvedValue([]);

      await listener.handleIssueUpdated(withMeta(event));

      expect(issuesRepo.addWatchersMany).toHaveBeenCalledWith('issue-1', ['user-3']);
      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MENTION',
          recipientIds: ['user-3'],
        }),
      );
    });
  });

  describe('handleIssueDeleted', () => {
    it('should record activity and trigger indexer deletion', async () => {
      const event = new IssueDeletedEvent('issue-1', 'user-1');

      await listener.handleIssueDeleted(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'ISSUE_DELETED', {},
        expect.anything(),
      );
      expect(indexerHooks.onIssueDeleted).toHaveBeenCalledWith('issue-1');
    });
  });

  describe('handleIssueRestored', () => {
    it('should record activity and trigger indexer', async () => {
      const event = new IssueRestoredEvent('issue-1', 'user-1');

      await listener.handleIssueRestored(withMeta(event));

      expect(activitiesService.recordOne).toHaveBeenCalledWith(
        'issue-1', 'user-1', 'ISSUE_RESTORED', {},
        expect.anything(),
      );
      expect(indexerHooks.onIssueChanged).toHaveBeenCalledWith('issue-1', 'issue_restored');
    });
  });

  describe('at-least-once delivery semantics', () => {
    const createdEvent = () =>
      new IssueCreatedEvent(
        'issue-1', 'proj-1', 'TEST', 'Test Project',
        1, 'New Issue', 'user-1',
        undefined, 'assignee-1', 'Test User',
      );

    it('claims an activity idempotency key derived from the event id', async () => {
      await listener.handleIssueCreated(withMeta(createdEvent()));

      expect(idempotency.runOnce).toHaveBeenCalledWith(
        'evt-1:activity',
        expect.any(Function),
      );
    });

    it('skips the activity write when the key was already claimed', async () => {
      idempotency.runOnce.mockResolvedValue(false);

      await listener.handleIssueCreated(withMeta(createdEvent()));

      expect(activitiesService.recordOne).not.toHaveBeenCalled();
    });

    it('passes an event-scoped dedupeKey to notification dispatch', async () => {
      await listener.handleIssueCreated(withMeta(createdEvent()));

      expect(notificationsDispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: 'evt-1:notif:ISSUE_ASSIGNED',
        }),
      );
    });

    it('propagates activity failures so the event is retried', async () => {
      activitiesService.recordOne.mockRejectedValue(new Error('db down'));

      await expect(
        listener.handleIssueCreated(withMeta(createdEvent())),
      ).rejects.toThrow('db down');
    });

    it('propagates notification dispatch failures so the event is retried', async () => {
      notificationsDispatch.dispatch.mockRejectedValue(new Error('redis down'));

      await expect(
        listener.handleIssueCreated(withMeta(createdEvent())),
      ).rejects.toThrow('redis down');
    });

    it('swallows workflow rule failures (at-most-once by design)', async () => {
      issuesRepo.findForRuleEvaluation.mockResolvedValue({ id: 'issue-1' });
      workflowEngine.executeRules.mockRejectedValue(new Error('rule boom'));

      await expect(
        listener.handleIssueCreated(withMeta(createdEvent())),
      ).resolves.toBeUndefined();
    });
  });
});
