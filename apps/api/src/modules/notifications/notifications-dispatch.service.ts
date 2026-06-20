import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, DeliveryChannel, EmailMode } from '@prisma/client';
import type { WebhookEventType } from '@repo/shared/schemas';
import { OutboxService, OutboxEventInput } from '@/modules/outbox/outbox.service';
import { TransactionService } from '@/common/repository/transaction.service';
import { IdempotencyRepository } from '@/common/idempotency/idempotency.repository';
import { NotificationsPreferencesService } from './notifications-preferences.service';
import { NotificationsService } from './notifications.service';
import {
  NotificationsRepository,
  NotificationCreateInput,
} from './notifications.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { RealtimeGateway } from '@/modules/realtime/realtime.gateway';
import { ChannelSettings } from '@repo/shared/schemas';
import { Tx } from '@/common/repository/tx.types';

interface RecipientPrefs {
  channelSettings: ChannelSettings;
  emailEnabled: boolean;
  emailMode: EmailMode;
}

interface ExternalTargets {
  webhookEventType: WebhookEventType | undefined;
  webhooks: Awaited<
    ReturnType<NotificationsRepository['findEnabledWebhooksForEvent']>
  >;
  telegram: Awaited<
    ReturnType<NotificationsRepository['findTelegramConfigForEvent']>
  >;
}

/**
 * Sentinel `actorId` for system-generated notifications (no human actor). Used
 * only to exclude the actor from recipients — it is never persisted, so it
 * needs no corresponding User row.
 */
export const SYSTEM_ACTOR_ID = 'system';

export interface DispatchNotificationInput {
  type: NotificationType;
  actorId: string;
  recipientIds: string[];
  issueId?: string;
  projectId?: string;
  payload: Record<string, unknown>;
  groupKey?: string;
  /**
   * Idempotency key claimed in the same transaction as the notification
   * writes. Callers that may redeliver the same logical notification
   * (domain-event listeners under at-least-once delivery) MUST set it —
   * a duplicate dispatch is then skipped entirely, including grouped
   * notification increments and outgoing email/webhook outbox rows.
   */
  dedupeKey?: string;
}

const NOTIFICATION_TO_WEBHOOK_EVENT: Partial<Record<NotificationType, WebhookEventType>> = {
  ISSUE_ASSIGNED: 'ASSIGNEE_CHANGED',
  STATUS_CHANGE: 'STATUS_CHANGED',
  COMMENT_ADD: 'COMMENT_ADDED',
  ISSUE_RESOLVED: 'ISSUE_RESOLVED',
  SPRINT_STARTED: 'SPRINT_STARTED',
  SPRINT_CLOSED: 'SPRINT_CLOSED',
};

@Injectable()
export class NotificationsDispatchService {
  private readonly logger = new Logger(NotificationsDispatchService.name);

  constructor(
    private txService: TransactionService,
    private notificationsRepo: NotificationsRepository,
    private outboxService: OutboxService,
    private preferencesService: NotificationsPreferencesService,
    private notificationsService: NotificationsService,
    private realtimeGateway: RealtimeGateway,
    private usersRepo: UsersReader,
    private idempotencyRepo: IdempotencyRepository,
  ) {}

  async dispatch(input: DispatchNotificationInput) {
    const filteredRecipients = await this.resolveRecipients(input);

    if (filteredRecipients.length === 0 && !this.isExternalEvent(input.type)) {
      return;
    }

    const recipientPrefs = await this.buildRecipientPrefs(filteredRecipients);
    const inAppRecipients = filteredRecipients.filter((userId) =>
      this.preferencesService.isChannelEnabled(
        recipientPrefs.get(userId)!.channelSettings,
        input.type,
        'inApp',
      ),
    );
    const external = await this.resolveExternalTargets(input);

    let isDuplicate = false;
    await this.txService.run(async (tx) => {
      if (input.dedupeKey) {
        const claimed = await this.idempotencyRepo.claim(tx, input.dedupeKey);
        if (!claimed) {
          isDuplicate = true;
          return;
        }
      }
      await this.persistInAppNotifications(tx, input, inAppRecipients);
      const outboxEvents = this.buildOutboxEvents(
        input,
        filteredRecipients,
        recipientPrefs,
        external,
      );
      await this.outboxService.createOutboxEvents(tx, outboxEvents);
    });

    if (isDuplicate) {
      this.logger.debug(`Duplicate notification dispatch skipped: ${input.dedupeKey}`);
      return;
    }

    await this.pushRealtime(input, inAppRecipients);
  }

  private async buildRecipientPrefs(
    recipients: string[],
  ): Promise<Map<string, RecipientPrefs>> {
    const prefsMap = await this.preferencesService.getMany(recipients);
    const recipientPrefs = new Map<string, RecipientPrefs>();
    for (const userId of recipients) {
      const prefs = prefsMap.get(userId)!;
      recipientPrefs.set(userId, {
        channelSettings: (prefs.channelSettings ?? {}) as ChannelSettings,
        emailEnabled: prefs.emailEnabled,
        emailMode: prefs.emailMode,
      });
    }
    return recipientPrefs;
  }

  private async resolveExternalTargets(
    input: DispatchNotificationInput,
  ): Promise<ExternalTargets> {
    const webhookEventType = this.isExternalEvent(input.type)
      ? NOTIFICATION_TO_WEBHOOK_EVENT[input.type]
      : undefined;

    const canRoute = Boolean(input.projectId && webhookEventType);
    const webhooks =
      canRoute && webhookEventType
        ? await this.notificationsRepo.findEnabledWebhooksForEvent(
            input.projectId!,
            webhookEventType,
          )
        : [];
    const telegram =
      canRoute && webhookEventType
        ? await this.notificationsRepo.findTelegramConfigForEvent(
            input.projectId!,
            webhookEventType,
          )
        : null;

    return { webhookEventType, webhooks, telegram };
  }

  private async persistInAppNotifications(
    tx: Tx,
    input: DispatchNotificationInput,
    inAppRecipients: string[],
  ): Promise<void> {
    if (inAppRecipients.length === 0) return;

    if (!input.groupKey) {
      await this.notificationsRepo.createMany(
        inAppRecipients.map((userId) => this.toInAppRow(userId, input)),
        tx,
      );
      return;
    }

    const existing = await this.notificationsRepo.findExistingGroupedNotifications(
      input.groupKey,
      inAppRecipients,
      tx,
    );
    const existingUserIds = new Set(existing.map((n) => n.userId));

    for (const notif of existing) {
      await this.notificationsRepo.incrementGroupedNotification(
        notif.id,
        notif.groupCount + 1,
        input.payload,
        tx,
      );
    }

    const newRecipients = inAppRecipients.filter((id) => !existingUserIds.has(id));
    if (newRecipients.length > 0) {
      await this.notificationsRepo.createMany(
        newRecipients.map((userId) => this.toInAppRow(userId, input)),
        tx,
      );
    }
  }

  private toInAppRow(
    userId: string,
    input: DispatchNotificationInput,
  ): NotificationCreateInput {
    return {
      userId,
      type: input.type,
      payload: input.payload,
      issueId: input.issueId,
      projectId: input.projectId,
      groupKey: input.groupKey,
    };
  }

  private buildOutboxEvents(
    input: DispatchNotificationInput,
    filteredRecipients: string[],
    recipientPrefs: Map<string, RecipientPrefs>,
    external: ExternalTargets,
  ): OutboxEventInput[] {
    const { webhookEventType, webhooks, telegram } = external;
    const outboxEvents: OutboxEventInput[] = [];

    for (const userId of filteredRecipients) {
      const prefs = recipientPrefs.get(userId)!;
      const emailEnabledForType = this.preferencesService.isChannelEnabled(
        prefs.channelSettings,
        input.type,
        'email',
      );
      if (emailEnabledForType && prefs.emailEnabled && prefs.emailMode !== EmailMode.OFF) {
        outboxEvents.push({
          aggregateType: 'notification',
          aggregateId: userId,
          eventType: input.type,
          channel: DeliveryChannel.EMAIL,
          payload: { userId, type: input.type, ...input.payload },
        });
      }
    }

    if (webhookEventType) {
      for (const webhook of webhooks) {
        outboxEvents.push({
          aggregateType: 'webhook',
          aggregateId: webhook.id,
          eventType: webhookEventType,
          channel: DeliveryChannel.WEBHOOK,
          payload: {
            webhookId: webhook.id,
            url: webhook.url,
            eventType: webhookEventType,
            data: input.payload,
          },
        });
      }
    }

    if (webhookEventType && telegram) {
      outboxEvents.push({
        aggregateType: 'telegram',
        aggregateId: telegram.id,
        eventType: webhookEventType,
        channel: DeliveryChannel.TELEGRAM,
        payload: {
          telegramConfigId: telegram.id,
          chatId: telegram.chatId,
          parseMode: telegram.parseMode,
          messageTemplate: telegram.messageTemplate,
          eventType: webhookEventType,
          data: input.payload,
        },
      });
    }

    return outboxEvents;
  }

  private async pushRealtime(
    input: DispatchNotificationInput,
    inAppRecipients: string[],
  ): Promise<void> {
    for (const userId of inAppRecipients) {
      this.realtimeGateway.sendToUser(userId, 'notification:new', {
        type: input.type,
        payload: input.payload,
        issueId: input.issueId,
        projectId: input.projectId,
      });
      await this.notificationsService.invalidateUnreadCount(userId);
    }
  }

  private async resolveRecipients(
    input: DispatchNotificationInput,
  ): Promise<string[]> {
    const candidateIds = input.recipientIds.filter((id) => id !== input.actorId);
    if (candidateIds.length === 0) return [];

    const validUserIds = await this.usersRepo.findActiveIdsByIds(candidateIds);

    const prefsMap = await this.preferencesService.getMany(validUserIds);
    const recipients = validUserIds.filter((userId) => {
      const prefs = prefsMap.get(userId);
      if (!prefs) return true;
      return !this.preferencesService.isMutedSync(prefs, input.projectId, input.issueId);
    });

    return recipients;
  }

  private isExternalEvent(type: NotificationType): boolean {
    return !!NOTIFICATION_TO_WEBHOOK_EVENT[type];
  }
}
