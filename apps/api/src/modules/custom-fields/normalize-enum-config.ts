import { createHash } from 'crypto';

export interface EnumOption {
  id: string;
  name: string;
  color: string | null;
  ordinal: number;
}

/**
 * Detects and fixes legacy config where enum options are stored as plain
 * strings (e.g. ["Production", "Staging"]) instead of proper objects
 * ({id, name, color, ordinal}).
 *
 * Pure — returns the normalized config + a `changed` flag. Legacy options use
 * deterministic UUID-compatible IDs so read responses and later mutations
 * agree without persisting config during a read.
 */
export function normalizeEnumConfig(
  fieldId: string,
  config: unknown,
): { config: Record<string, unknown>; changed: boolean } {
  const cfg = (config ?? {}) as Record<string, unknown>;
  if (!Array.isArray(cfg.options)) {
    return { config: cfg, changed: false };
  }

  const options = cfg.options as unknown[];
  const needsFix = options.some((option) => !hasOptionId(option));
  if (!needsFix) return { config: cfg, changed: false };

  const normalized: EnumOption[] = options.map((o, i): EnumOption => {
    if (typeof o === 'string') {
      return { id: legacyOptionId(fieldId, o, i), name: o, color: null, ordinal: i };
    }
    const obj = o as Record<string, unknown>;
    const name = (obj.name as string) ?? String(o);
    return {
      id: hasOptionId(o) ? o.id : legacyOptionId(fieldId, name, i),
      name,
      color: (obj.color as string | null) ?? null,
      ordinal: (obj.ordinal as number) ?? i,
    };
  });

  return { config: { ...cfg, options: normalized }, changed: true };
}

function hasOptionId(option: unknown): option is { id: string } {
  return (
    typeof option === 'object' &&
    option !== null &&
    typeof (option as Record<string, unknown>).id === 'string' &&
    (option as { id: string }).id.length > 0
  );
}

function legacyOptionId(fieldId: string, name: string, ordinal: number): string {
  const hash = createHash('sha1')
    .update(`${fieldId}\u0000${ordinal}\u0000${name}`)
    .digest('hex');
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
