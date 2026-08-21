import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  apiKeyId?: string;
}

/**
 * Machine callers get their own throttle bucket instead of sharing the IP
 * bucket with humans behind the same NAT. `req.apiKeyId` is set by
 * `ApiKeyAuthService.authenticate` only after a key passes every validity
 * check, and authentication runs before this guard, so keying on it directly
 * cannot be defeated by a rotating/forged `X-Api-Key` header — an
 * unauthenticated request (no `apiKeyId`, header or not) falls back to the
 * IP bucket, same as a human request.
 */
@Injectable()
export class ApiKeyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: TrackedRequest): Promise<string> {
    if (typeof req.apiKeyId === 'string' && req.apiKeyId.length > 0) {
      return `apikey:${req.apiKeyId}`;
    }
    // Delegate rather than reimplement: the base guard's own req.ip lookup is
    // what every human request must keep getting, unchanged.
    return super.getTracker(req);
  }
}
