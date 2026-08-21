import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { AppLogger } from '@/common/logging/app-logger';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { setRequestUserId } from '@/common/context/request-context';
import type { IntegrationRequest } from '@/common/http/integration-request';
import { ApiKeysRepository } from './api-keys.repository';
import { hashApiKey } from './api-key-token';

/**
 * Writing lastUsedAt on every request would turn a busy integration into one
 * UPDATE per call against a single row, for a field a human reads occasionally.
 */
const LAST_USED_THROTTLE_MS = 60_000;

@Injectable()
export class ApiKeyAuthService {
  private readonly logger = new AppLogger(ApiKeyAuthService.name);

  constructor(
    private repo: ApiKeysRepository,
    private background: BackgroundTasks,
  ) {}

  async authenticate(req: IntegrationRequest, presented: string): Promise<boolean> {
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
      this.logger.warn('API key rejected', { keyId: row?.id ?? null });
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
}
