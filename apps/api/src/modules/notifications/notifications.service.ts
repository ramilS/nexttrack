import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ConfigType } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';
import { ErrorCode } from '@repo/shared/error-codes';
import { NotificationType } from '@prisma/client';
import { notificationConfig } from '@/config';
import { NotificationQueryInput } from '@repo/shared/schemas';
import type { NotificationItem } from '@repo/shared/schemas';
import type { CursorMeta } from '@repo/shared';
import {
  NotificationsRepository,
  type NotificationRow,
} from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private repo: NotificationsRepository,
    private redis: RedisService,
    @Inject(notificationConfig.KEY)
    private config: ConfigType<typeof notificationConfig>,
  ) {}

  async findAll(
    userId: string,
    query: NotificationQueryInput,
  ): Promise<{ items: NotificationItem[]; meta: CursorMeta }> {
    const page = await this.repo.findPage({
      userId,
      isRead: query.isRead,
      type: query.type as NotificationType | undefined,
      projectId: query.projectId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    return { items: page.items.map((n) => this.toDto(n)), meta: page.meta };
  }

  // Response boundary: flatten to the columns the client uses (drop the
  // issue/project includes and email/updatedAt columns) and map `createdAt` to
  // an ISO string so the shape matches notificationItemSchema.
  private toDto(n: NotificationRow): NotificationItem {
    return {
      id: n.id,
      type: n.type,
      payload: (n.payload ?? {}) as Record<string, unknown>,
      isRead: n.isRead,
      groupKey: n.groupKey,
      groupCount: n.groupCount,
      issueId: n.issueId,
      projectId: n.projectId,
      createdAt: n.createdAt.toISOString(),
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notifications:unread:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return parseInt(cached, 10);

    const count = await this.repo.countUnread(userId);

    await this.redis.set(cacheKey, String(count), this.config.unreadCountCacheTtlSeconds);
    return count;
  }

  async markRead(userId: string, notificationIds: string[]) {
    await this.repo.markRead(userId, notificationIds);
    await this.invalidateUnreadCount(userId);
  }

  async markAllRead(userId: string) {
    await this.repo.markAllRead(userId);
    await this.invalidateUnreadCount(userId);
  }

  async remove(userId: string, notificationId: string) {
    const notification = await this.repo.findById(notificationId, userId);
    if (!notification) {
      throw new NotFoundError(ErrorCode.NOTIFICATION_NOT_FOUND);
    }

    await this.repo.delete(notificationId);
    if (!notification.isRead) {
      await this.invalidateUnreadCount(userId);
    }
  }

  async invalidateUnreadCount(userId: string) {
    await this.redis.del(`notifications:unread:${userId}`);
  }
}
