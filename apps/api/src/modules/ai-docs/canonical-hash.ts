import { createHash } from 'node:crypto';

/**
 * Recursively sort object keys so structurally-equal JSON always serializes to
 * the same bytes. A naive `JSON.stringify` preserves insertion order, so two
 * equal Tiptap docs with differently-ordered keys would hash differently and
 * produce false staleness conflicts.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Stable SHA-256 of a Tiptap document, used as the OCC base for doc-update proposals. */
export function canonicalTiptapHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(content)))
    .digest('hex');
}
