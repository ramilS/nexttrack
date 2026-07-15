import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { migrationRunTerminalResult } from './run-blocker';

function axiosError(status: number, message: string): AxiosError {
  const config: InternalAxiosRequestConfig = {
    method: 'post',
    url: '/admin/migration/users',
    headers: new AxiosHeaders({ Authorization: 'Bearer must-not-leak' }),
  };
  return new AxiosError('request failed', 'AUTH_ERROR', config, undefined, {
    status,
    statusText: 'Authentication failure',
    headers: new AxiosHeaders(),
    config,
    data: { error: { code: 'AUTH_ERROR', message } },
  });
}

describe('migrationRunTerminalResult', () => {
  it.each([401, 403])(
    'classifies Axios %s as a sanitized authentication blocker and preserves the error',
    (status) => {
      const originalError = axiosError(status, 'sensitive-response-body');

      const result = migrationRunTerminalResult(originalError);

      expect(result).toEqual({
        status: 'BLOCKED',
        blocker: 'AUTHENTICATION',
        terminalMessage:
          `Migration blocked by authentication (HTTP ${status}). ` +
          'Refresh credentials and resume.',
        originalError,
      });
      expect(result.terminalMessage).not.toContain('sensitive-response-body');
      expect(result.terminalMessage).not.toContain('must-not-leak');
    },
  );

  it('preserves the existing formatted interruption for a non-authentication error', () => {
    const originalError = new Error('source parse failed');

    expect(migrationRunTerminalResult(originalError)).toEqual({
      status: 'INTERRUPTED',
      blocker: null,
      terminalMessage: 'Migration interrupted: source parse failed',
      originalError,
    });
  });
});
