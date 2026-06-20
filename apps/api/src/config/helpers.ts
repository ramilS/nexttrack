import { z } from 'zod';

const PLACEHOLDER_PATTERNS = [
  /change[-_]?me/i,
  /placeholder/i,
  /\byour[-_]/i,
  /^example/i,
];

function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

const PLACEHOLDER_ERROR = {
  message:
    'Secret looks like a placeholder (e.g. "change_me", "your-…"). Set a real value in production.',
};

const notPlaceholderInProduction = (value: string) =>
  process.env.NODE_ENV !== 'production' || !looksLikePlaceholder(value);

/**
 * Zod string with a minimum length, additionally rejecting known
 * placeholder patterns (e.g. "change_me", "your-…") when
 * NODE_ENV === 'production'. Prevents shipping unmodified .env.example
 * secrets to production.
 */
export function productionSecret(minLength: number) {
  return z.string().min(minLength).refine(notPlaceholderInProduction, PLACEHOLDER_ERROR);
}

/**
 * Like {@link productionSecret} but with an exact length constraint
 * (useful for hex-encoded keys, e.g. AES-256 = 64 hex chars).
 */
export function productionHexKey(exactLength: number) {
  return z.string().length(exactLength).refine(notPlaceholderInProduction, PLACEHOLDER_ERROR);
}

/**
 * Boolean env flag. Accepts only the literal strings 'true'/'false' —
 * never z.coerce.boolean(), which treats ANY non-empty string
 * (including 'false') as true. Unset → defaultValue; anything else
 * fails fast at startup.
 */
export function envBoolean(defaultValue: boolean) {
  return z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? defaultValue : v === 'true'));
}

/**
 * Tri-state variant of {@link envBoolean}: unset stays undefined so the
 * consumer can derive the default from other state (e.g. NODE_ENV).
 */
export function envBooleanOptional() {
  return z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional();
}
