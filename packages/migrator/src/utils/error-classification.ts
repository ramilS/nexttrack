import axios from 'axios';

export type MigrationErrorClassification =
  | 'FATAL'
  | 'TRANSIENT'
  | 'PERMANENT';

const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

export function classifyMigrationError(
  error: unknown,
): MigrationErrorClassification {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined) return 'TRANSIENT';
    if (status === 401 || status === 403) return 'FATAL';
    if (status === 408 || status === 429 || (status >= 500 && status < 600)) {
      return 'TRANSIENT';
    }
    return 'PERMANENT';
  }

  const code = getErrorCode(error);
  return code !== undefined && TRANSIENT_NODE_CODES.has(code)
    ? 'TRANSIENT'
    : 'PERMANENT';
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}
