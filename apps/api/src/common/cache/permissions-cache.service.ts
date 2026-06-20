import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { ValkeyService } from '@/valkey/valkey.service';

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
  private readonly logger = new AppLogger(PermissionsCacheService.name);

  constructor(private valkey: ValkeyService) {}

  async getMembership(
    userId: string,
    projectId: string,
    loader: () => Promise<CachedMembership | null>,
  ): Promise<CachedMembership | null> {
    let key: string | null = null;

    try {
      const epoch = (await this.valkey.get(EPOCH_KEY)) ?? '0';
      key = `perms:${epoch}:${userId}:${projectId}`;

      const cached = await this.valkey.get(key);
      if (cached !== null) {
        return cached === NOT_A_MEMBER
          ? null
          : (JSON.parse(cached) as CachedMembership);
      }
    } catch (err) {
      this.logger.warn('Permissions cache read failed, falling back to DB', {
        userId,
        projectId,
        error: (err as Error).message,
      });
      return loader();
    }

    const membership = await loader();

    try {
      if (membership) {
        await this.valkey.set(key, JSON.stringify(membership), MEMBER_TTL_SECONDS);
      } else {
        await this.valkey.set(key, NOT_A_MEMBER, NEGATIVE_TTL_SECONDS);
      }
    } catch (err) {
      this.logger.warn('Permissions cache write failed', {
        userId,
        projectId,
        error: (err as Error).message,
      });
    }

    return membership;
  }

  async invalidateAll(): Promise<void> {
    try {
      await this.valkey.incr(EPOCH_KEY);
    } catch (err) {
      this.logger.error(
        `Permissions cache invalidation failed — stale permissions possible for up to ${MEMBER_TTL_SECONDS}s`,
        err,
      );
    }
  }
}
