import { INestApplication } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { requestIdMiddleware } from '@/common/context/request-id.middleware';
import { appConfig } from '@/config';

// Express/body-parser defaults to 100kb, which is too small for this app:
// Tiptap rich-text (issue descriptions, comments) and especially the migration
// import (an issue's full change history with before/after description markup)
// legitimately exceed it. Nest's built-in parser is disabled at bootstrap
// (`bodyParser: false`) so this single, parity-shared limit applies everywhere.
const JSON_BODY_LIMIT = '10mb';

/**
 * Request-pipeline middleware shared by the production bootstrap (`main.ts`)
 * and the integration-test harness (`create-e2e-app.ts`). Applying it in both
 * keeps tests on the same request id / security-header / cookie / body-limit
 * behavior the API serves in production — the same parity motive behind
 * registering the exception filter as an `APP_FILTER` rather than in `main.ts`.
 * Both bootstraps create the app with `bodyParser: false`, so the parsers below
 * are the ONLY body parsers and their limit is authoritative.
 *
 * The `/api` global prefix is deliberately NOT here: it is a deployment-only
 * routing concern (a framework-guaranteed string prefix) that adds no
 * behavioral coverage in tests but would force every supertest URL to carry it.
 */
export function configureApp(app: INestApplication): void {
  applyTrustProxy(app);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
}

/**
 * Defaults to `false` (Express's own default), so `req.ip` is the proxy's
 * address unless a deployer opts in — the failed-attempt limiter (keyed on
 * IP) and every security-event log otherwise bucket all clients behind one
 * reverse proxy together. Split out from `configureApp` so it is testable
 * without also exercising `cookie-parser`'s CJS default export, which
 * ts-jest's module interop cannot resolve in this project's config.
 */
export function applyTrustProxy(app: INestApplication): void {
  const { trustProxy } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
}
