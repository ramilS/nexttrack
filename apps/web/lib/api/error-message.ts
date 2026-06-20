import { isAxiosError } from 'axios';

/**
 * Pulls the server-provided message out of the API error envelope
 * (`{ error: { code, message, statusCode } }` produced by AllExceptionsFilter).
 *
 * Returns undefined for non-Axios errors, responses without the envelope, or
 * the generic Axios `"Request failed with status code N"` message — callers
 * fall back to their own copy in that case.
 */
export function getApiErrorMessage(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;

  const data: unknown = error.response?.data;
  if (data === null || typeof data !== 'object' || !('error' in data)) {
    return undefined;
  }

  const inner: unknown = (data as { error: unknown }).error;
  if (
    inner === null ||
    typeof inner !== 'object' ||
    !('message' in inner) ||
    typeof (inner as { message: unknown }).message !== 'string'
  ) {
    return undefined;
  }

  return (inner as { message: string }).message;
}
