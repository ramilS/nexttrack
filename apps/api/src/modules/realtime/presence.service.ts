import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ValkeyService } from '@/valkey/valkey.service';
import { websocketConfig } from '@/config';

const PRESENCE_KEY = 'presence:online';

@Injectable()
export class PresenceService {
  constructor(
    private valkey: ValkeyService,
    @Inject(websocketConfig.KEY)
    private ws: ConfigType<typeof websocketConfig>,
  ) {}

  async setOnline(userId: string) {
    await this.valkey.sadd(PRESENCE_KEY, userId);
    await this.valkey.expire(PRESENCE_KEY, this.ws.presenceTtlSeconds);
  }

  async setOffline(userId: string) {
    await this.valkey.srem(PRESENCE_KEY, userId);
  }

  async isOnline(userId: string): Promise<boolean> {
    const members = await this.valkey.smembers(PRESENCE_KEY);
    return members.includes(userId);
  }

  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    const allOnline = await this.valkey.smembers(PRESENCE_KEY);
    const onlineSet = new Set(allOnline);
    return userIds.filter((id) => onlineSet.has(id));
  }

  async getOnlineCount(): Promise<number> {
    return this.valkey.scard(PRESENCE_KEY);
  }
}
