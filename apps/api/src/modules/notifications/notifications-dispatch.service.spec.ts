import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationsDispatchService } from './notifications-dispatch.service';
import { NotificationsRepository } from './notifications.repository';
import { OutboxService } from '@/modules/outbox/outbox.service';
import { NotificationsPreferencesService } from './notifications-preferences.service';
import type { ChannelSettings } from '@repo/shared/schemas';
import { NotificationsService } from './notifications.service';
import { RealtimeGateway } from '@/modules/realtime/realtime.gateway';
import { UsersReader } from '@/modules/users/users.reader';
import { IdempotencyRepository } from '@/common/idempotency/idempotency.repository';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';

describe('NotificationsDispatchService', () => {
  let service: NotificationsDispatchService;
  let notificationsRepo: Record<string, jest.Mock>;
  let outboxService: { createOutboxEvents: jest.Mock };
  let preferencesService: {
    get: jest.Mock;
    getMany: jest.Mock;
    isChannelEnabled: jest.Mock;
    isMuted: jest.Mock;
    isMutedSync: jest.Mock;
  };
  let notificationsService: { invalidateUnreadCount: jest.Mock };
  let realtimeGateway: { sendToUser: jest.Mock };
  let usersRepo: { findActiveIdsByIds: jest.Mock };
  let idempotencyRepo: { claim: jest.Mock };
  let txService: { run: jest.Mock };

  beforeEach(async () => {
    outboxService = { createOutboxEvents: jest.fn().mockResolvedValue(undefined) };
    const defaultPrefs = {
      channelSettings: {},
      emailEnabled: true,
      emailMode: 'INSTANT',
      mutedProjectIds: [],
      mutedIssueIds: [],
    };
    preferencesService = {
      get: jest.fn().mockResolvedValue(defaultPrefs),
      getMany: jest.fn().mockImplementation(async (userIds: string[]) => {
        const map = new Map();
        for (const id of userIds) map.set(id, { ...defaultPrefs, userId: id });
        return map;
      }),
      isChannelEnabled: jest.fn().mockReturnValue(true),
      isMuted: jest.fn().mockResolvedValue(false),
      isMutedSync: jest.fn().mockReturnValue(false),
    };
    notificationsService = {
      invalidateUnreadCount: jest.fn().mockResolvedValue(undefined),
    };
    realtimeGateway = { sendToUser: jest.fn() };
    usersRepo = { findActiveIdsByIds: jest.fn().mockResolvedValue([]) };
    idempotencyRepo = { claim: jest.fn().mockResolvedValue(true) };
    txService = {
      run: jest
        .fn()
        .mockImplementation(async (fn: (tx: Tx) => Promise<unknown>) =>
          fn({} as Tx),
        ),
    };

    notificationsRepo = {
      createMany: jest.fn().mockResolvedValue(undefined),
      findExistingGroupedNotifications: jest.fn().mockResolvedValue([]),
      incrementGroupedNotification: jest.fn().mockResolvedValue(undefined),
      findEnabledWebhooksForEvent: jest.fn().mockResolvedValue([]),
      findTelegramConfigForEvent: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsDispatchService,
        { provide: TransactionService, useValue: txService },
        { provide: NotificationsRepository, useValue: notificationsRepo },
        { provide: OutboxService, useValue: outboxService },
        { provide: NotificationsPreferencesService, useValue: preferencesService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: UsersReader, useValue: usersRepo },
        { provide: IdempotencyRepository, useValue: idempotencyRepo },
      ],
    }).compile();

    service = module.get(NotificationsDispatchService);
  });

  it('should filter out actor from recipients', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'user-1',
      recipientIds: ['user-1', 'user-2'],
      payload: {},
    });

    // user-1 (actor) excluded before the active-id lookup
    expect(usersRepo.findActiveIdsByIds).toHaveBeenCalledWith(['user-2']);
  });

  it('should skip dispatch when no active recipients and not an external event', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue([]);

    await service.dispatch({
      // MENTION is not in NOTIFICATION_TO_WEBHOOK_EVENT, so it's purely internal
      type: NotificationType.MENTION,
      actorId: 'actor',
      recipientIds: ['blocked-user'],
      payload: {},
    });

    expect(notificationsRepo.createMany).not.toHaveBeenCalled();
    expect(txService.run).not.toHaveBeenCalled();
  });

  it('should filter out muted users', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['muted-user']);
    preferencesService.isMutedSync.mockReturnValue(true);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['muted-user'],
      payload: {},
    });

    expect(notificationsRepo.createMany).not.toHaveBeenCalled();
  });

  it('should create in-app notifications and push via WebSocket', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      issueId: 'issue-1',
      projectId: 'proj-1',
      payload: { preview: 'Hello' },
    });

    expect(notificationsRepo.createMany).toHaveBeenCalled();
    expect(realtimeGateway.sendToUser).toHaveBeenCalledWith(
      'user-2',
      'notification:new',
      expect.objectContaining({ type: 'COMMENT_ADD' }),
    );
    expect(notificationsService.invalidateUnreadCount).toHaveBeenCalledWith('user-2');
  });

  it('claims the dedupeKey inside the write transaction', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      payload: {},
      dedupeKey: 'evt-1:notif:COMMENT_ADD',
    });

    expect(idempotencyRepo.claim).toHaveBeenCalledWith(
      expect.anything(),
      'evt-1:notif:COMMENT_ADD',
    );
    expect(notificationsRepo.createMany).toHaveBeenCalled();
  });

  it('skips the entire dispatch when the dedupeKey was already claimed', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);
    idempotencyRepo.claim.mockResolvedValue(false);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      payload: {},
      dedupeKey: 'evt-1:notif:COMMENT_ADD',
    });

    expect(notificationsRepo.createMany).not.toHaveBeenCalled();
    expect(outboxService.createOutboxEvents).not.toHaveBeenCalled();
    expect(realtimeGateway.sendToUser).not.toHaveBeenCalled();
  });

  it('does not claim anything when no dedupeKey is provided', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      payload: {},
    });

    expect(idempotencyRepo.claim).not.toHaveBeenCalled();
    expect(notificationsRepo.createMany).toHaveBeenCalled();
  });

  it('should skip in-app for users with channel disabled', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);
    preferencesService.isChannelEnabled.mockImplementation(
      (_settings: ChannelSettings, _type: NotificationType, channel: string) =>
        channel !== 'inApp',
    );

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      payload: {},
    });

    expect(realtimeGateway.sendToUser).not.toHaveBeenCalled();
  });

  it('should create webhook outbox events for external event types', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue(['user-2']);
    notificationsRepo.findEnabledWebhooksForEvent.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com' },
    ]);

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: ['user-2'],
      projectId: 'proj-1',
      payload: {},
    });

    expect(outboxService.createOutboxEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ aggregateType: 'webhook', channel: 'WEBHOOK' }),
      ]),
    );
  });

  it('should create telegram outbox event when telegram config matches', async () => {
    usersRepo.findActiveIdsByIds.mockResolvedValue([]);
    notificationsRepo.findTelegramConfigForEvent.mockResolvedValue({
      id: 'tg-1',
      chatId: 'chat-1',
      parseMode: 'Markdown',
      messageTemplate: null,
    });

    await service.dispatch({
      type: NotificationType.COMMENT_ADD,
      actorId: 'actor',
      recipientIds: [],
      projectId: 'proj-1',
      payload: {},
    });

    expect(outboxService.createOutboxEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ aggregateType: 'telegram', channel: 'TELEGRAM' }),
      ]),
    );
  });
});
