import { ApiKeyAwareThrottlerGuard } from './api-key-aware-throttler.guard';

describe('ApiKeyAwareThrottlerGuard', () => {
  let guard: ApiKeyAwareThrottlerGuard;

  beforeEach(() => {
    guard = Object.create(ApiKeyAwareThrottlerGuard.prototype) as ApiKeyAwareThrottlerGuard;
  });

  it('buckets an authenticated request by its key id, not the caller IP', async () => {
    const tracker = await guard['getTracker']({
      headers: {},
      ip: '10.0.0.1',
      apiKeyId: 'key-1',
    });

    expect(tracker).toBe('apikey:key-1');
  });

  it('falls back to the IP for a request that never authenticated, even carrying an X-Api-Key header, so a rotating fake header cannot mint buckets', async () => {
    const tracker = await guard['getTracker']({
      headers: { 'x-api-key': 'nt_never_seen' },
      ip: '10.0.0.1',
    });

    expect(tracker).toBe('10.0.0.1');
  });

  it('uses the IP when there is no key header and no apiKeyId', async () => {
    const tracker = await guard['getTracker']({ headers: {}, ip: '10.0.0.2' });
    expect(tracker).toBe('10.0.0.2');
  });
});
