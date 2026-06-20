import { ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';

/**
 * Encode a cursor payload as a base64url string.
 * Cursor payloads are opaque JSON objects containing sort field values + id.
 */
export function encodeCursor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode a base64url cursor string back to a typed payload.
 * Throws ValidationError if the cursor is malformed.
 */
export function decodeCursor<T extends Record<string, unknown>>(cursor: string): T {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Cursor must be a JSON object');
    }
    return parsed as T;
  } catch {
    throw new ValidationError(ErrorCode.INVALID_CURSOR);
  }
}

/**
 * Encode an Elasticsearch search_after cursor.
 */
export function encodeEsCursor(payload: { searchAfter: unknown[]; id: string }): string {
  return encodeCursor(payload);
}

/**
 * Decode an Elasticsearch search_after cursor.
 */
export function decodeEsCursor(cursor: string): { searchAfter: unknown[]; id: string } {
  const decoded = decodeCursor<{ searchAfter: unknown[]; id: string }>(cursor);
  if (!Array.isArray(decoded.searchAfter) || typeof decoded.id !== 'string') {
    throw new ValidationError(ErrorCode.INVALID_CURSOR);
  }
  return decoded;
}
