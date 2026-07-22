import { createHash } from 'node:crypto';

const SECRET_KEY = /(?:authorization|cookie|token|secret|password|credential|api[-_]?key)/i;
const MAX_DEPTH = 8;
const MAX_NODES = 500;
const MAX_STRING_LENGTH = 2_000;

export function sanitizeMigrationErrorMessage(value: string): string {
  return truncateUtf8(redactMigrationSecrets(value), MAX_STRING_LENGTH);
}

function redactMigrationSecrets(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [redacted]')
    .replace(
      /\b([A-Za-z0-9_-]*(?:authorization|cookie|token|secret|password|credential|api[-_]?key)[A-Za-z0-9_-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\b(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted]',
    )
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gi, '[redacted]');
}

export function containsMigrationSecret(value: string): boolean {
  return redactMigrationSecrets(value) !== value;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalJsonChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function sanitizeMigrationErrorDetails(
  value: Record<string, unknown>,
): Record<string, unknown> {
  let nodes = 0;
  const sanitize = (input: unknown, depth: number): unknown => {
    nodes++;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) return '[truncated]';
    if (typeof input === 'string') {
      return redactMigrationSecrets(input) !== input
        ? '[redacted]'
        : truncateUtf8(input, MAX_STRING_LENGTH);
    }
    if (
      input === null ||
      typeof input === 'boolean' ||
      (typeof input === 'number' && Number.isFinite(input))
    ) {
      return input;
    }
    if (Array.isArray(input)) {
      return input.slice(0, MAX_NODES).map((child) => sanitize(child, depth + 1));
    }
    if (typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([key]) => !SECRET_KEY.test(key))
          .map(([key, child]) => [key, sanitize(child, depth + 1)]),
      );
    }
    return truncateUtf8(String(input), MAX_STRING_LENGTH);
  };
  return sanitize(value, 0) as Record<string, unknown>;
}
