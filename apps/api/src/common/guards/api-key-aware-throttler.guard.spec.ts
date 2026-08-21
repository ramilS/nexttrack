import { ApiKeyAwareThrottlerGuard } from './api-key-aware-throttler.guard';
import { hashApiKey } from '@/modules/api-keys/api-key-token';

describe('ApiKeyAwareThrottlerGuard', () => {
  const RAW = 'nt_verified_key';
  let guard: ApiKeyAwareThrottlerGuard;

  beforeEach(() => {
    guard = Object.create(ApiKeyAwareThrottlerGuard.prototype) as ApiKeyAwareThrottlerGuard;
    ApiKeyAwareThrottlerGuard.verifiedKeys.clear();
  });

  it('buckets a verified key by its key id, not the caller IP', async () => {
    ApiKeyAwareThrottlerGuard.rememberVerifiedKey(hashApiKey(RAW), 'key-1');

    const tracker = await guard['getTracker']({
      headers: { 'x-api-key': RAW },
      ip: '10.0.0.1',
    });

    expect(tracker).toBe('apikey:key-1');
  });

  it('falls back to the IP for an unknown key so a rotating fake header cannot mint buckets', async () => {
    const tracker = await guard['getTracker']({
      headers: { 'x-api-key': 'nt_never_seen' },
      ip: '10.0.0.1',
    });

    expect(tracker).toBe('10.0.0.1');
  });

  it('uses the IP when no key header is present', async () => {
    const tracker = await guard['getTracker']({ headers: {}, ip: '10.0.0.2' });
    expect(tracker).toBe('10.0.0.2');
  });
});
