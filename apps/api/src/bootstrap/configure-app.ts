import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from '@/common/context/request-id.middleware';

/**
 * Request-pipeline middleware shared by the production bootstrap (`main.ts`)
 * and the integration-test harness (`create-e2e-app.ts`). Applying it in both
 * keeps tests on the same request id / security-header / cookie behavior the
 * API serves in production — the same parity motive behind registering the
 * exception filter as an `APP_FILTER` rather than in `main.ts`.
 *
 * The `/api` global prefix is deliberately NOT here: it is a deployment-only
 * routing concern (a framework-guaranteed string prefix) that adds no
 * behavioral coverage in tests but would force every supertest URL to carry it.
 */
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
}
