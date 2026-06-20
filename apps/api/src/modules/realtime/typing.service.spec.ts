import { Test, TestingModule } from '@nestjs/testing';
import { TypingService } from './typing.service';
import { RedisService } from '@/redis/redis.service';
import { websocketConfig } from '@/config';

describe('TypingService', () => {
  let service: TypingService;

  const mockRedis = {
    hset: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
    expire: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypingService,
        { provide: RedisService, useValue: mockRedis },
        {
          provide: websocketConfig.KEY,
          useValue: { presenceTtlSeconds: 300, typingTtlSeconds: 5 },
        },
      ],
    }).compile();

    service = module.get(TypingService);
    jest.clearAllMocks();
  });

  // --- startTyping ---

  describe('startTyping', () => {
    it('should set user typing hash entry and expire key', async () => {
      mockRedis.hset.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      const before = Date.now();
      await service.startTyping('user-1', 'issue-42');
      const after = Date.now();

      expect(mockRedis.hset).toHaveBeenCalledWith(
        'typing:issue-42',
        'user-1',
        expect.any(String),
      );

      const storedTimestamp = parseInt(
        mockRedis.hset.mock.calls[0][2] as string,
        10,
      );
      expect(storedTimestamp).toBeGreaterThanOrEqual(before);
      expect(storedTimestamp).toBeLessThanOrEqual(after);

      expect(mockRedis.expire).toHaveBeenCalledWith('typing:issue-42', 5);
    });
  });

  // --- stopTyping ---

  describe('stopTyping', () => {
    it('should delete user from typing hash', async () => {
      mockRedis.hdel.mockResolvedValue(1);

      await service.stopTyping('user-1', 'issue-42');

      expect(mockRedis.hdel).toHaveBeenCalledWith('typing:issue-42', 'user-1');
    });
  });

  // --- getTypingUsers ---

  describe('getTypingUsers', () => {
    it('should return only users whose timestamp is within 5 seconds', async () => {
      const now = Date.now();
      mockRedis.hgetall.mockResolvedValue({
        'user-1': String(now),
        'user-2': String(now - 10000),
      });

      const result = await service.getTypingUsers('issue-42');

      expect(result).toEqual(['user-1']);
      expect(mockRedis.hgetall).toHaveBeenCalledWith('typing:issue-42');
    });

    it('should return all users when all timestamps are fresh', async () => {
      const now = Date.now();
      mockRedis.hgetall.mockResolvedValue({
        'user-1': String(now - 1000),
        'user-2': String(now - 2000),
        'user-3': String(now - 4999),
      });

      const result = await service.getTypingUsers('issue-42');

      expect(result).toEqual(['user-1', 'user-2', 'user-3']);
    });

    it('should return empty array when all timestamps are expired', async () => {
      const now = Date.now();
      mockRedis.hgetall.mockResolvedValue({
        'user-1': String(now - 6000),
        'user-2': String(now - 10000),
      });

      const result = await service.getTypingUsers('issue-42');

      expect(result).toEqual([]);
    });

    it('should return empty array when no users are typing', async () => {
      mockRedis.hgetall.mockResolvedValue({});

      const result = await service.getTypingUsers('issue-42');

      expect(result).toEqual([]);
    });
  });
});
