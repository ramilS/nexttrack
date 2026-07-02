import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { formatHttpError } from './http-error';

function axiosError(props: Record<string, unknown>): AxiosError {
  return { isAxiosError: true, ...props } as unknown as AxiosError;
}

describe('formatHttpError', () => {
  it('names method, full URL, status, code and message (NextTrack envelope)', () => {
    const err = axiosError({
      config: { method: 'post', baseURL: 'http://localhost:3001/api', url: '/admin/migration/users' } as any,
      response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'bad input' } } },
    });
    expect(formatHttpError(err)).toBe(
      'POST http://localhost:3001/api/admin/migration/users → 400 [VALIDATION_ERROR]: bad input',
    );
  });

  it('spells out a 404 with the full source URL (YouTrack)', () => {
    const err = axiosError({
      config: { method: 'get', baseURL: 'https://yt.example.com/api', url: '/admin/users' } as any,
      response: { status: 404, data: { error: 'Not Found', error_description: 'no such resource' } },
    });
    expect(formatHttpError(err)).toBe(
      'GET https://yt.example.com/api/admin/users → 404 [Not Found]: no such resource',
    );
  });

  it('reports connection failures with no response', () => {
    const err = axiosError({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED',
      config: { method: 'get', baseURL: 'http://localhost:3001/api', url: '/x' } as any,
    });
    expect(formatHttpError(err)).toBe('GET http://localhost:3001/api/x → no response (ECONNREFUSED)');
  });

  it('falls through to the message for non-axios errors', () => {
    expect(formatHttpError(new Error('boom'))).toBe('boom');
  });
});
