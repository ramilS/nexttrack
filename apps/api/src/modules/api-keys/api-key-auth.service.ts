import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { AppLogger } from '@/common/logging/app-logger';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { setRequestUserId } from '@/common/context/request-context';
import type { IntegrationRequest } from '@/common/http/integration-request';
import { apiKeyAuthConfig } from '@/config';
import { ValkeyService } from '@/valkey/valkey.service';
import { ApiKeysRepository } from './api-keys.repository';
import { hashApiKey } from './api-key-token';

/**
 * Writing lastUsedAt on every request would turn a busy integration into one
 * UPDATE per call against a single row, for a field a human reads occasionally.
 */
const LAST_USED_THROTTLE_MS = 60_000;

const FAILED_ATTEMPTS_KEY_PREFIX = 'apikeyauth:fail:';
const UNKNOWN_IP = 'unknown';

@Injectable()
export class ApiKeyAuthService {
  private readonly logger = new AppLogger(ApiKeyAuthService.name);

  constructor(
    private repo: ApiKeysRepository,
    private background: BackgroundTasks,
    private valkey: ValkeyService,
    @Inject(apiKeyAuthConfig.KEY)
    private rateLimit: ConfigType<typeof apiKeyAuthConfig>,
  ) {}

  async authenticate(req: IntegrationRequest, presented: string): Promise<boolean> {
    // JwtAuthGuard runs twice per request today (once as the global APP_GUARD,
    // once again via @ProjectAuth()/@IssueAuth()/@BoardAuth()'s own @UseGuards).
    // apiKeyId is set only by a successful pass of THIS method, so it is the one
    // marker safe to key on — req.user alone isn't, since another auth source
    // could populate it without ever validating a key.
    if (req.apiKeyId !== undefined && req.user !== undefined) {
      return true;
    }

    // Express's own resolution — the same source the login path logs for
    // security events, not a spoofable header we'd parse ourselves.
    const ip = req.ip ?? UNKNOWN_IP;

    if (await this.isRateLimited(ip)) {
      // Object form (not a bare string): AllExceptionsFilter reads `.code`
      // straight off the response body for the client-facing `error.code` —
      // a plain-string HttpException response is left unwrapped and would
      // surface as UNKNOWN_ERROR instead.
      throw new HttpException(
        { code: ErrorCode.RATE_LIMITED, message: 'Too many failed API key attempts' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const row = await this.repo.findActiveByHash(hashApiKey(presented));
    const now = new Date();

    // One error for every failure mode: distinct codes would confirm to an
    // attacker that a guessed key exists.
    if (
      !row ||
      row.revokedAt !== null ||
      (row.expiresAt !== null && row.expiresAt <= now) ||
      row.user.kind !== UserKind.SERVICE ||
      row.user.isBlocked ||
      row.user.deletedAt !== null
    ) {
      this.logger.warn('API key rejected', { keyId: row?.id ?? null, ip });
      await this.recordFailedAttempt(ip);
      throw new UnauthorizedException(ErrorCode.API_KEY_INVALID);
    }

    req.user = {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      avatarUrl: row.user.avatarUrl,
      kind: row.user.kind,
    };
    req.apiKeyId = row.id;
    setRequestUserId(row.user.id);

    if (this.shouldTouch(row.lastUsedAt, now)) {
      this.background.run(
        () => this.repo.touchLastUsed(row.id, now),
        (err) => this.logger.error('Failed to update API key lastUsedAt', err, { keyId: row.id }),
      );
    }

    return true;
  }

  private shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
    return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
  }

  /**
   * Fail-open by design: a forged key already costs an attacker nothing more
   * than one indexed DB lookup, so a Valkey outage merely restores today's
   * (already-acceptable) exposure. Fail-closed here would let a cache blip
   * take down every legitimate integration in the project — worse than the
   * amplification this check exists to prevent.
   */
  private async isRateLimited(ip: string): Promise<boolean> {
    try {
      const raw = await this.valkey.get(this.failedAttemptsKey(ip));
      const count = raw === null ? 0 : Number(raw);
      return count >= this.rateLimit.failedAttemptsLimit;
    } catch (err) {
      this.logger.warn('API key rate-limit check failed, allowing request through', {
        ip,
        error: (err as Error).message,
      });
      return false;
    }
  }

  private async recordFailedAttempt(ip: string): Promise<void> {
    const key = this.failedAttemptsKey(ip);
    try {
      const count = await this.valkey.incr(key);
      if (count === 1) {
        await this.valkey.expire(key, this.rateLimit.failedAttemptsWindowSeconds);
      }
    } catch (err) {
      this.logger.warn('Failed to record API key failure for rate limiting', {
        ip,
        error: (err as Error).message,
      });
    }
  }

  private failedAttemptsKey(ip: string): string {
    return `${FAILED_ATTEMPTS_KEY_PREFIX}${ip}`;
  }
}
