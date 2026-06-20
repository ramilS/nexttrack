import { Test, TestingModule } from '@nestjs/testing';
import { PresenceService } from './presence.service';
import { RedisService } from '@/redis/redis.service';
import { websocketConfig } from '@/config';

describe('PresenceService', () => {
  let service: PresenceService;

  const mockRedis = {
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    scard: jest.fn(),
    expire: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: RedisService, useValue: mockRedis },
        {
          provide: websocketConfig.KEY,
          useValue: { presenceTtlSeconds: 300, typingTtlSeconds: 5 },
        },
      ],
    }).compile();

    service = module.get(PresenceService);
    jest.clearAllMocks();
  });

  // --- setOnline ---

  describe('setOnline', () => {
    it('should add user to presence set and set expiry', async () => {
      mockRedis.sadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await service.setOnline('user-1');

      expect(mockRedis.sadd).toHaveBeenCalledWith('presence:online', 'user-1');
      expect(mockRedis.expire).toHaveBeenCalledWith('presence:online', 300);
    });
  });

  // --- setOffline ---

  describe('setOffline', () => {
    it('should remove user from presence set', async () => {
      mockRedis.srem.mockResolvedValue(1);

      await service.setOffline('user-1');

      expect(mockRedis.srem).toHaveBeenCalledWith('presence:online', 'user-1');
    });
  });

  // --- isOnline ---

  describe('isOnline', () => {
    it('should return true when user is in the set', async () => {
      mockRedis.smembers.mockResolvedValue(['user-1', 'user-2']);

      const result = await service.isOnline('user-1');

      expect(result).toBe(true);
      expect(mockRedis.smembers).toHaveBeenCalledWith('presence:online');
    });

    it('should return false when user is not in the set', async () => {
      mockRedis.smembers.mockResolvedValue(['user-2', 'user-3']);

      const result = await service.isOnline('user-1');

      expect(result).toBe(false);
    });

    it('should return false when set is empty', async () => {
      mockRedis.smembers.mockResolvedValue([]);

      const result = await service.isOnline('user-1');

      expect(result).toBe(false);
    });
  });

  // --- getOnlineUsers ---

  describe('getOnlineUsers', () => {
    it('should return only users that are online from given list', async () => {
      mockRedis.smembers.mockResolvedValue(['user-1', 'user-3']);

      const result = await service.getOnlineUsers([
        'user-1',
        'user-2',
        'user-3',
        'user-4',
      ]);

      expect(result).toEqual(['user-1', 'user-3']);
    });

    it('should return empty array when no users are online', async () => {
      mockRedis.smembers.mockResolvedValue([]);

      const result = await service.getOnlineUsers(['user-1', 'user-2']);

      expect(result).toEqual([]);
    });

    it('should return empty array when given empty user list', async () => {
      mockRedis.smembers.mockResolvedValue(['user-1']);

      const result = await service.getOnlineUsers([]);

      expect(result).toEqual([]);
    });
  });

  // --- getOnlineCount ---

  describe('getOnlineCount', () => {
    it('should return the cardinality of the presence set', async () => {
      mockRedis.scard.mockResolvedValue(5);

      const result = await service.getOnlineCount();

      expect(result).toBe(5);
      expect(mockRedis.scard).toHaveBeenCalledWith('presence:online');
    });

    it('should return 0 when no users are online', async () => {
      mockRedis.scard.mockResolvedValue(0);

      const result = await service.getOnlineCount();

      expect(result).toBe(0);
    });
  });
});
