import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  failedAttemptsLimit: z.coerce.number().int().min(1).max(1_000).default(20),
  failedAttemptsWindowSeconds: z.coerce.number().int().min(1).max(3_600).default(60),
  revokedKeyRetentionDays: z.coerce.number().int().min(1).max(3_650).default(30),
});

export type ApiKeyAuthConfig = z.infer<typeof schema>;

/**
 * Everything the API-key feature needs from typed config, grouped in one
 * file rather than split across two:
 * - Failed-attempt rate limiting for `X-Api-Key` authentication. Kept
 *   separate from `throttleConfig`: that config backs route-level
 *   `@Throttle` buckets (in-memory, per process); this one backs a
 *   cross-process Valkey counter checked inside `ApiKeyAuthService` itself,
 *   before every DB lookup.
 * - `revokedKeyRetentionDays`: how long a revoked key still appears in
 *   `ApiKeysService.list` before it drops off — a revoked key is inert, so
 *   there is nothing to lose by aging it out, only an ever-growing
 *   "Revoked" list to avoid.
 */
export const apiKeyAuthConfig = registerAs('apiKeyAuth', (): ApiKeyAuthConfig => {
  return schema.parse({
    failedAttemptsLimit: process.env.API_KEY_AUTH_FAILED_ATTEMPTS_LIMIT,
    failedAttemptsWindowSeconds: process.env.API_KEY_AUTH_FAILED_ATTEMPTS_WINDOW_SECONDS,
    revokedKeyRetentionDays: process.env.API_KEY_AUTH_REVOKED_KEY_RETENTION_DAYS,
  });
});
