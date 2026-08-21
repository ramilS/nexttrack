import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { API_KEY_HEADER } from '@/common/http/integration-request';
import { hashApiKey } from '@/modules/api-keys/api-key-token';

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

interface VerifiedApiKey {
  keyId: string;
  seenAt: number;
}

const VERIFIED_KEY_TTL_MS = 5 * 60_000;

/**
 * Machine callers get their own throttle bucket instead of sharing the IP
 * bucket with humans behind the same NAT. Only keys that have already
 * authenticated successfully are bucketed this way — the cache is written
 * exclusively from `ApiKeyAuthService.authenticate` after a key passes every
 * validity check, so a caller cannot mint fresh buckets by rotating a fake
 * header value; an unrecognised key falls back to the IP bucket, same as a
 * human request.
 */
@Injectable()
export class ApiKeyAwareThrottlerGuard extends ThrottlerGuard {
  static readonly verifiedKeys = new Map<string, VerifiedApiKey>();

  /**
   * Sweeps expired entries on every write instead of running a timer — the
   * map only ever grows by one verified key per call, so this keeps it
   * bounded to keys seen within the TTL window without extra machinery.
   */
  static rememberVerifiedKey(hash: string, keyId: string): void {
    const now = Date.now();
    for (const [cachedHash, entry] of ApiKeyAwareThrottlerGuard.verifiedKeys) {
      if (now - entry.seenAt >= VERIFIED_KEY_TTL_MS) {
        ApiKeyAwareThrottlerGuard.verifiedKeys.delete(cachedHash);
      }
    }
    ApiKeyAwareThrottlerGuard.verifiedKeys.set(hash, { keyId, seenAt: now });
  }

  protected async getTracker(req: TrackedRequest): Promise<string> {
    const presented = req.headers[API_KEY_HEADER];
    if (typeof presented === 'string' && presented.length > 0) {
      const entry = ApiKeyAwareThrottlerGuard.verifiedKeys.get(hashApiKey(presented));
      if (entry && Date.now() - entry.seenAt < VERIFIED_KEY_TTL_MS) {
        return `apikey:${entry.keyId}`;
      }
    }
    // Delegate rather than reimplement: the base guard's own req.ip lookup is
    // what every human request must keep getting, unchanged.
    return super.getTracker(req);
  }
}
