import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './error-message';

function buildAxiosError(data: unknown, status = 400): AxiosError {
  const response = {
    data,
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('getApiErrorMessage', () => {
  it('returns the server message from the error envelope', () => {
    const error = buildAxiosError({
      error: { code: 'BOARD_TYPE_MISMATCH', message: 'Sprints can only be created for SCRUM boards', statusCode: 400 },
    });

    expect(getApiErrorMessage(error)).toBe('Sprints can only be created for SCRUM boards');
  });

  it('returns undefined when the envelope has no message', () => {
    const error = buildAxiosError({ error: { code: 'X', statusCode: 400 } });

    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined when the response body has no error envelope', () => {
    const error = buildAxiosError({ something: 'else' });

    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined when there is no response (network error)', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');

    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined for non-Axios errors', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBeUndefined();
    expect(getApiErrorMessage('boom')).toBeUndefined();
    expect(getApiErrorMessage(null)).toBeUndefined();
  });
});
