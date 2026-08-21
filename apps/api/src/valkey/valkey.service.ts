import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '@/common/logging/app-logger';
import { valkeyConfig } from '@/config';

const COMPARE_AND_DELETE_BY_JSON_FIELD_SCRIPT = `
  local value = redis.call('GET', KEYS[1])
  if not value then
    return 0
  end

  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= 'table' or decoded[ARGV[1]] ~= ARGV[2] then
    return 0
  end

  redis.call('DEL', KEYS[1])
  return value
`;

const INCREMENT_WITH_EXPIRY_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
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

  async compareAndDeleteByJsonField(
    key: string,
    field: string,
    expectedValue: string,
  ): Promise<string | null> {
    const result = await this.client.eval(
      COMPARE_AND_DELETE_BY_JSON_FIELD_SCRIPT,
      1,
      key,
      field,
      expectedValue,
    );
    return typeof result === 'string' ? result : null;
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

  /**
   * Atomically increments `key` and, only on the increment that creates it
   * (count reaches 1), arms its TTL — one Lua script, one round trip. A
   * separate `incr()` + `expire()` pair leaves a window where the key exists
   * with no expiry if the process dies or the connection drops between the
   * two calls: the counter then never expires and permanently locks out
   * whatever it's keyed on. Returns the new count.
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(
      INCREMENT_WITH_EXPIRY_SCRIPT,
      1,
      key,
      ttlSeconds,
    );
    return Number(result);
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
