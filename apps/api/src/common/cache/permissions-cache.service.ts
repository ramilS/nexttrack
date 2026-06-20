import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';

export interface CachedMembership {
  userId: string;
  projectId: string;
  roleId: string;
  permissions: string[];
}

const EPOCH_KEY = 'perms:epoch';
const MEMBER_TTL_SECONDS = 300;
const NEGATIVE_TTL_SECONDS = 60;
const NOT_A_MEMBER = 'none';

/**
 * Read-through Redis cache for project membership permission lookups —
 * the hottest query in the API (every @RequirePermission request).
 *
 * Invalidation is epoch-based: any role/membership mutation bumps a global
 * counter that is part of every cache key, so all stale entries become
 * unreachable at once and expire via TTL. Coarse, but mutation traffic is
 * tiny compared to reads, and it needs no SCAN/pattern deletes.
 *
 * The cache must never break authorization: any Redis failure falls back
 * to the loader (DB) with a warning.
 */
@Injectable()
export class PermissionsCacheService {
  private readonly logger = new Logger(PermissionsCacheService.name);

  constructor(private redis: RedisService) {}

  async getMembership(
    userId: string,
    projectId: string,
    loader: () => Promise<CachedMembership | null>,
  ): Promise<CachedMembership | null> {
    let key: string | null = null;

    try {
      const epoch = (await this.redis.get(EPOCH_KEY)) ?? '0';
      key = `perms:${epoch}:${userId}:${projectId}`;

      const cached = await this.redis.get(key);
      if (cached !== null) {
        return cached === NOT_A_MEMBER
          ? null
          : (JSON.parse(cached) as CachedMembership);
      }
    } catch (err) {
      this.logger.warn(
        `Permissions cache read failed, falling back to DB: ${(err as Error).message}`,
      );
      return loader();
    }

    const membership = await loader();

    try {
      if (membership) {
        await this.redis.set(key, JSON.stringify(membership), MEMBER_TTL_SECONDS);
      } else {
        await this.redis.set(key, NOT_A_MEMBER, NEGATIVE_TTL_SECONDS);
      }
    } catch (err) {
      this.logger.warn(
        `Permissions cache write failed: ${(err as Error).message}`,
      );
    }

    return membership;
  }

  async invalidateAll(): Promise<void> {
    try {
      await this.redis.incr(EPOCH_KEY);
    } catch (err) {
      this.logger.error(
        `Permissions cache invalidation failed — stale permissions possible for up to ${MEMBER_TTL_SECONDS}s: ${(err as Error).message}`,
      );
    }
  }
}
