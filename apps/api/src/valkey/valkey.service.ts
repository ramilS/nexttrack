import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '@/common/logging/app-logger';
import { valkeyConfig } from '@/config';

@Injectable()
export class ValkeyService implements OnModuleDestroy {
  private readonly logger = new AppLogger(ValkeyService.name);
  private client: Redis;

  constructor(
    @Inject(valkeyConfig.KEY)
    config: ConfigType<typeof valkeyConfig>,
  ) {
    this.client = new Redis(config.url);
    this.client.on('connect', () => this.logger.log('Valkey connected'));
    // ioredis re-emits 'error' on every reconnect attempt; warn without a
    // stack so an outage doesn't flood error logs with identical traces.
    this.client.on('error', (err: Error) =>
      this.logger.warn('Valkey connection error', { error: err.message }),
    );
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Valkey disconnected');
  }
}
