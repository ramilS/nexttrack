import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';
import { websocketConfig } from '@/config';

@Injectable()
export class TypingService {
  constructor(
    private redis: RedisService,
    @Inject(websocketConfig.KEY)
    private ws: ConfigType<typeof websocketConfig>,
  ) {}

  async startTyping(userId: string, issueId: string) {
    const key = `typing:${issueId}`;
    await this.redis.hset(key, userId, String(Date.now()));
    await this.redis.expire(key, this.ws.typingTtlSeconds);
  }

  async stopTyping(userId: string, issueId: string) {
    const key = `typing:${issueId}`;
    await this.redis.hdel(key, userId);
  }

  async getTypingUsers(issueId: string): Promise<string[]> {
    const key = `typing:${issueId}`;
    const data = await this.redis.hgetall(key);
    const now = Date.now();
    const ttlMs = this.ws.typingTtlSeconds * 1000;
    return Object.entries(data)
      .filter(([, ts]) => now - parseInt(ts, 10) < ttlMs)
      .map(([userId]) => userId);
  }
}
