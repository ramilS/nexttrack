import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ValkeyService } from '@/valkey/valkey.service';
import { websocketConfig } from '@/config';

@Injectable()
export class TypingService {
  constructor(
    private valkey: ValkeyService,
    @Inject(websocketConfig.KEY)
    private ws: ConfigType<typeof websocketConfig>,
  ) {}

  async startTyping(userId: string, issueId: string) {
    const key = `typing:${issueId}`;
    await this.valkey.hset(key, userId, String(Date.now()));
    await this.valkey.expire(key, this.ws.typingTtlSeconds);
  }

  async stopTyping(userId: string, issueId: string) {
    const key = `typing:${issueId}`;
    await this.valkey.hdel(key, userId);
  }

  async getTypingUsers(issueId: string): Promise<string[]> {
    const key = `typing:${issueId}`;
    const data = await this.valkey.hgetall(key);
    const now = Date.now();
    const ttlMs = this.ws.typingTtlSeconds * 1000;
    return Object.entries(data)
      .filter(([, ts]) => now - parseInt(ts, 10) < ttlMs)
      .map(([userId]) => userId);
  }
}
