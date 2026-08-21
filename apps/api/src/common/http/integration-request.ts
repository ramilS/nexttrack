import type { IncomingHttpHeaders } from 'node:http';
import type { UserKind } from '@prisma/client';
import type { RequestUser } from '@/common/decorators/current-user.decorator';

export const API_KEY_HEADER = 'x-api-key';

/** Request fields this feature adds, typed so no call site needs a cast. */
export interface IntegrationRequest {
  headers: IncomingHttpHeaders;
  /** Express's own resolution — the same source the login path logs for security events. */
  ip?: string;
  user?: RequestUser & { kind: UserKind };
  apiKeyId?: string;
}
