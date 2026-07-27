import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '@/common/logging/app-logger';
import { valkeyConfig } from '@/config';

const COMPARE_AND_DELETE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

const COMPARE_AND_SET_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
    return 1
  end
  return 0
`;

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

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async getAndDelete(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async compareAndDelete(key: string, expectedValue: string): Promise<boolean> {
    const result = await this.client.eval(COMPARE_AND_DELETE_SCRIPT, 1, key, expectedValue);
    return result === 1;
  }

  async compareAndSet(
    key: string,
    expectedValue: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.eval(
      COMPARE_AND_SET_SCRIPT,
      1,
      key,
      expectedValue,
      value,
      ttlSeconds,
    );
    return result === 1;
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
