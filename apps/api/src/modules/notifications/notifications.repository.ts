import { Injectable } from '@nestjs/common';
import { EmailMode, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type { ChannelSettings } from '@repo/shared/schemas';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';
import type { CursorMeta } from '@repo/shared';
import type { WebhookEventType } from '@repo/shared/schemas';

const NOTIFICATION_INCLUDE = {
  issue: { select: { id: true, number: true, title: true, projectId: true } },
  project: { select: { id: true, key: true, name: true } },
} as const;

export type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

export interface NotificationCreateInput {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  issueId?: string;
  projectId?: string;
  groupKey?: string;
}

export interface NotificationListFilters {
  userId: string;
  isRead?: boolean;
  type?: NotificationType;
  projectId?: string;
  cursor?: string;
  pageSize: number;
}

export interface NotificationPreferencesRow {
  userId: string;
  emailMode: EmailMode;
  emailEnabled: boolean;
  channelSettings: Prisma.JsonValue;
  mutedProjectIds: string[];
  mutedIssueIds: string[];
}

export interface ExistingGroupedNotification {
  id: string;
  userId: string;
  groupCount: number;
}

export interface ProjectWebhookForDelivery {
  id: string;
  url: string;
}

export interface ProjectTelegramForDelivery {
  id: string;
  chatId: string;
  parseMode: string | null;
  messageTemplate: string | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findPage(
    filters: NotificationListFilters,
  ): Promise<{ items: NotificationRow[]; meta: CursorMeta }> {
    const where: Prisma.NotificationWhereInput = { userId: filters.userId };
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.type) where.type = filters.type;
    if (filters.projectId) where.projectId = filters.projectId;

    const cursorArgs = buildSimpleCursorArgs({
      cursor: filters.cursor,
      pageSize: filters.pageSize,
    });

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...cursorArgs,
      include: NOTIFICATION_INCLUDE,
    });

    return buildSimpleCursorResult(items, filters.pageSize);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(userId: string, notificationIds: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: { in: notificationIds }, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async findById(
    notificationId: string,
    userId: string,
  ): Promise<{ id: string; isRead: boolean } | null> {
    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, isRead: true },
    });
  }

  async delete(notificationId: string): Promise<void> {
    await this.prisma.notification.delete({ where: { id: notificationId } });
  }

  // ─── Dispatch helpers (tx-aware) ─────────────────────────

  async findExistingGroupedNotifications(
    groupKey: string,
    userIds: string[],
    tx?: Tx,
  ): Promise<ExistingGroupedNotification[]> {
    return this.db(tx).notification.findMany({
      where: { groupKey, userId: { in: userIds }, isRead: false },
      select: { id: true, userId: true, groupCount: true },
    });
  }

  async incrementGroupedNotification(
    notificationId: string,
    newCount: number,
    payload: Record<string, unknown>,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).notification.update({
      where: { id: notificationId },
      data: {
        groupCount: newCount,
        payload: asJson(payload),
        updatedAt: new Date(),
      },
    });
  }

  async createMany(inputs: NotificationCreateInput[], tx?: Tx): Promise<void> {
    if (inputs.length === 0) return;
    await this.db(tx).notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        payload: asJson(i.payload),
        issueId: i.issueId,
        projectId: i.projectId,
        groupKey: i.groupKey,
      })),
    });
  }

  // ─── Preferences ─────────────────────────────────────────

  async upsertPreferences(
    userId: string,
    patch: {
      emailMode?: EmailMode;
      emailEnabled?: boolean;
      channelSettings?: ChannelSettings;
      mutedProjectIds?: string[];
      mutedIssueIds?: string[];
    } = {},
  ): Promise<NotificationPreferencesRow> {
    const { channelSettings, ...rest } = patch;
    const data = {
      ...rest,
      ...(channelSettings !== undefined
        ? { channelSettings: asJson(channelSettings) }
        : {}),
    };
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async findPreferencesByUserIds(
    userIds: string[],
  ): Promise<NotificationPreferencesRow[]> {
    if (userIds.length === 0) return [];
    return this.prisma.notificationPreferences.findMany({
      where: { userId: { in: userIds } },
    });
  }

  // ─── Delivery integration lookups ────────────────────────

  async findEnabledWebhooksForEvent(
    projectId: string,
    eventType: WebhookEventType,
  ): Promise<ProjectWebhookForDelivery[]> {
    return this.prisma.projectWebhook.findMany({
      where: {
        projectId,
        isEnabled: true,
        eventTypes: { has: eventType },
      },
      select: { id: true, url: true },
    });
  }

  async findTelegramConfigForEvent(
    projectId: string,
    eventType: WebhookEventType,
  ): Promise<ProjectTelegramForDelivery | null> {
    const row = await this.prisma.projectTelegramConfig.findUnique({
      where: { projectId },
      select: {
        id: true,
        chatId: true,
        parseMode: true,
        messageTemplate: true,
        eventTypes: true,
        isEnabled: true,
      },
    });
    if (!row || !row.isEnabled || !row.eventTypes.includes(eventType)) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chatId,
      parseMode: row.parseMode,
      messageTemplate: row.messageTemplate,
    };
  }
}
