import { createHash, randomBytes } from 'node:crypto';

const RAW_KEY_BYTES = 32;
const KEY_NAMESPACE = 'nt_';
export const API_KEY_PREFIX_LENGTH = 11;

/**
 * base64url encodes 6 bits per character with no padding, so the encoded
 * length of a fixed byte count is the same for every value it produces
 * (verified: 100 generated keys all measured 43 chars for RAW_KEY_BYTES=32).
 * That makes an exact length check sound, not just a lower bound.
 */
const RAW_KEY_ENCODED_LENGTH = Math.ceil((RAW_KEY_BYTES * 8) / 6);
const EXPECTED_RAW_KEY_LENGTH = KEY_NAMESPACE.length + RAW_KEY_ENCODED_LENGTH;

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

/**
 * Cheap pre-check for a presented credential, run before any DB lookup or
 * rate-limit read: a value with the wrong namespace or the wrong length
 * cannot possibly be one of ours, so it is rejected without spending an
 * indexed query on it.
 */
export function hasPlausibleApiKeyShape(candidate: string): boolean {
  return candidate.length === EXPECTED_RAW_KEY_LENGTH && candidate.startsWith(KEY_NAMESPACE);
}
