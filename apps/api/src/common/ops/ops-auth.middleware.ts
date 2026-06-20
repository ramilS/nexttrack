import {
  Inject,
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { appConfig, opsConfig } from '@/config';

/**
 * Actuator-style protection for the whole /internal/* management prefix.
 * Every operational endpoint mounted under `internal/` is covered
 * automatically — no per-controller guard to forget.
 *
 * - OPS_TOKEN configured → require `Authorization: Bearer <token>`
 *   (timing-safe; Prometheus supports this in scrape_configs.authorization).
 * - No token in production → 404 for the whole prefix.
 * - No token outside production → open for local development.
 */
@Injectable()
export class OpsAuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(opsConfig.KEY)
    private ops: ConfigType<typeof opsConfig>,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const expected = this.ops.token;

    if (!expected) {
      if (this.app.nodeEnv === 'production') {
        throw new NotFoundException();
      }
      next();
      return;
    }

    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

    const expectedBuf = Buffer.from(expected);
    const presentedBuf = Buffer.from(presented);
    const matches =
      expectedBuf.length === presentedBuf.length &&
      timingSafeEqual(expectedBuf, presentedBuf);

    if (!matches) {
      throw new UnauthorizedException();
    }
    next();
  }
}
