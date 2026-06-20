import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';
import { websocketConfig } from '@/config';

const PRESENCE_KEY = 'presence:online';

@Injectable()
export class PresenceService {
  constructor(
    private redis: RedisService,
    @Inject(websocketConfig.KEY)
    private ws: ConfigType<typeof websocketConfig>,
  ) {}

  async setOnline(userId: string) {
    await this.redis.sadd(PRESENCE_KEY, userId);
    await this.redis.expire(PRESENCE_KEY, this.ws.presenceTtlSeconds);
  }

  async setOffline(userId: string) {
    await this.redis.srem(PRESENCE_KEY, userId);
  }

  async isOnline(userId: string): Promise<boolean> {
    const members = await this.redis.smembers(PRESENCE_KEY);
    return members.includes(userId);
  }

  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    const allOnline = await this.redis.smembers(PRESENCE_KEY);
    const onlineSet = new Set(allOnline);
    return userIds.filter((id) => onlineSet.has(id));
  }

  async getOnlineCount(): Promise<number> {
    return this.redis.scard(PRESENCE_KEY);
  }
}
