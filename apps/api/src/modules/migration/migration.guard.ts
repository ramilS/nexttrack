import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { migrationConfig } from '@/config';
import { GlobalRole } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';

interface MigrationRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { role: GlobalRole };
}

@Injectable()
export class MigrationGuard implements CanActivate {
  constructor(
    @Inject(migrationConfig.KEY)
    private migration: ConfigType<typeof migrationConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<MigrationRequest>();
    const secret = req.headers['x-migration-secret'];

    if (
      !this.migration.apiSecret ||
      !this.secretMatches(secret, this.migration.apiSecret)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MIGRATION_UNAUTHORIZED,
        message: 'Invalid migration secret',
      });
    }

    if (!req.user || req.user.role !== GlobalRole.ADMIN) {
      throw new ForbiddenException({
        code: ErrorCode.MIGRATION_UNAUTHORIZED,
        message: 'Admin role required for migration endpoints',
      });
    }

    return true;
  }

  // Constant-time compare to avoid leaking the secret via timing. The length
  // check is required because timingSafeEqual throws on unequal-length buffers.
  private secretMatches(
    provided: string | string[] | undefined,
    expected: string,
  ): boolean {
    if (typeof provided !== 'string') {
      return false;
    }
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
