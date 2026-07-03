import { describe, it, expect } from 'vitest';
import { unwrapEnvelope } from './api-client';

describe('unwrapEnvelope', () => {
  it('strips the TransformInterceptor { data, meta } envelope to the service payload', () => {
    const body = {
      data: { data: { id: 'issue-1' }, existed: false },
      meta: { timestamp: '2026-07-01T00:00:00.000Z' },
    };

    expect(unwrapEnvelope<{ data: { id: string }; existed: boolean }>(body)).toEqual({
      data: { id: 'issue-1' },
      existed: false,
    });
  });

  it('unwraps a find-style payload so the inner entity is reachable', () => {
    const body = { data: { data: { id: 'user-1' } }, meta: {} };

    const payload = unwrapEnvelope<{ data: { id: string } | null }>(body);
    expect(payload.data).toEqual({ id: 'user-1' });
  });

  it('unwraps a stats payload directly', () => {
    const body = { data: { projectKey: 'DEVX', counts: { issues: 3 } }, meta: {} };

    expect(unwrapEnvelope<{ projectKey: string; counts: { issues: number } }>(body)).toEqual({
      projectKey: 'DEVX',
      counts: { issues: 3 },
    });
  });
});
