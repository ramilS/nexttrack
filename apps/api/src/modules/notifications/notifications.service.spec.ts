import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import type { NotificationQueryInput } from '@repo/shared/schemas';
import { RedisService } from '@/redis/redis.service';
import { notificationConfig } from '@/config';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Record<string, jest.Mock>;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    repo = {
      findPage: jest.fn(),
      countUnread: jest.fn(),
      markRead: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repo },
        { provide: RedisService, useValue: redis },
        {
          provide: notificationConfig.KEY,
          useValue: { unreadCountCacheTtlSeconds: 30 },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('findAll', () => {
    it('maps rows to the response shape (createdAt → ISO) and forwards the query', async () => {
      const createdAt = new Date('2026-01-02T03:04:05.000Z');
      repo.findPage.mockResolvedValue({
        items: [
          {
            id: 'n1',
            type: 'ISSUE_ASSIGNED',
            payload: { issueId: 'i1' },
            isRead: false,
            groupKey: null,
            groupCount: 1,
            issueId: 'i1',
            projectId: 'p1',
            createdAt,
          },
        ],
        meta: { hasNextPage: false, pageSize: 10, nextCursor: null },
      });

      const query: NotificationQueryInput = { pageSize: 10 };
      const result = await service.findAll('user-1', query);

      expect(result.items[0]).toEqual({
        id: 'n1',
        type: 'ISSUE_ASSIGNED',
        payload: { issueId: 'i1' },
        isRead: false,
        groupKey: null,
        groupCount: 1,
        issueId: 'i1',
        projectId: 'p1',
        createdAt: '2026-01-02T03:04:05.000Z',
      });
      expect(result.meta).toEqual({
        hasNextPage: false,
        pageSize: 10,
        nextCursor: null,
      });
      expect(repo.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', pageSize: 10 }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return cached count', async () => {
      redis.get.mockResolvedValue('5');

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(5);
      expect(repo.countUnread).not.toHaveBeenCalled();
    });

    it('should query repo and cache on miss', async () => {
      redis.get.mockResolvedValue(null);
      repo.countUnread.mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(3);
      expect(redis.set).toHaveBeenCalledWith(
        'notifications:unread:user-1',
        '3',
        30,
      );
    });
  });

  describe('markRead', () => {
    it('should mark notifications and invalidate cache', async () => {
      await service.markRead('user-1', ['n1', 'n2']);

      expect(repo.markRead).toHaveBeenCalledWith('user-1', ['n1', 'n2']);
      expect(redis.del).toHaveBeenCalledWith('notifications:unread:user-1');
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread and invalidate cache', async () => {
      await service.markAllRead('user-1');

      expect(repo.markAllRead).toHaveBeenCalledWith('user-1');
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete read notification without invalidating cache', async () => {
      repo.findById.mockResolvedValue({ id: 'n1', isRead: true });

      await service.remove('user-1', 'n1');

      expect(repo.delete).toHaveBeenCalledWith('n1');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should invalidate cache when deleting unread notification', async () => {
      repo.findById.mockResolvedValue({ id: 'n1', isRead: false });

      await service.remove('user-1', 'n1');

      expect(redis.del).toHaveBeenCalledWith('notifications:unread:user-1');
    });

    it('should throw NotFoundError when missing', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove('user-1', 'missing')).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
