import axios, { AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { classifyMigrationError } from './error-classification';

function axiosError(status?: number, code?: string) {
  return new axios.AxiosError(
    'request failed',
    code,
    undefined,
    undefined,
    status === undefined
      ? undefined
      : {
          status,
          data: {},
          headers: {},
          config: { headers: new AxiosHeaders() },
          statusText: '',
        },
  );
}

describe('classifyMigrationError', () => {
  it.each([401, 403])('classifies %s as fatal', (status) => {
    expect(classifyMigrationError(axiosError(status))).toBe('FATAL');
  });

  it.each([408, 429, 500, 502, 503, 504, 599])(
    'classifies %s as transient',
    (status) => {
      expect(classifyMigrationError(axiosError(status))).toBe('TRANSIENT');
    },
  );

  it.each([400, 404, 409, 422])('classifies %s as permanent', (status) => {
    expect(classifyMigrationError(axiosError(status))).toBe('PERMANENT');
  });

  it('classifies a timeout without a response as transient', () => {
    expect(classifyMigrationError(axiosError(undefined, 'ECONNABORTED'))).toBe(
      'TRANSIENT',
    );
  });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'])(
    'classifies the Node %s code as transient',
    (code) => {
      expect(classifyMigrationError(Object.assign(new Error('network'), { code }))).toBe(
        'TRANSIENT',
      );
    },
  );

  it('classifies other non-Axios errors as permanent', () => {
    expect(
      classifyMigrationError(Object.assign(new Error('invalid'), { code: 'EINVAL' })),
    ).toBe('PERMANENT');
  });

  it('does not classify a non-HTTP status above 599 as transient', () => {
    expect(classifyMigrationError(axiosError(600))).toBe('PERMANENT');
  });
});
