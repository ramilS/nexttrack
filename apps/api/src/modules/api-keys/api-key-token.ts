import { createHash, randomBytes } from 'node:crypto';

const RAW_KEY_BYTES = 32;
const KEY_NAMESPACE = 'nt_';
export const API_KEY_PREFIX_LENGTH = 11;

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * The raw value is returned to the caller exactly once and never stored. Only
 * the SHA-256 hash is persisted: 32 random bytes already carry enough entropy
 * that a slow hash buys nothing, which is the same reasoning applied to
 * refresh tokens.
 */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_NAMESPACE + randomBytes(RAW_KEY_BYTES).toString('base64url');
  return {
    raw,
    prefix: raw.slice(0, API_KEY_PREFIX_LENGTH),
    hash: hashApiKey(raw),
  };
}
