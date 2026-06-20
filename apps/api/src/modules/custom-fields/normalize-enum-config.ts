import { randomUUID } from 'crypto';

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
 * Pure — returns the normalized config + a `changed` flag so the caller can
 * decide whether to persist. This is a lazy migration: services run it on
 * read, persist if changed, and the field is fixed permanently afterward.
 */
export function normalizeEnumConfig(
  config: unknown,
): { config: Record<string, unknown>; changed: boolean } {
  const cfg = (config ?? {}) as Record<string, unknown>;
  if (!Array.isArray(cfg.options)) {
    return { config: cfg, changed: false };
  }

  const options = cfg.options as unknown[];
  const needsFix = options.some(
    (o) => typeof o === 'string' || (typeof o === 'object' && o !== null && !('id' in o)),
  );
  if (!needsFix) return { config: cfg, changed: false };

  const normalized: EnumOption[] = options.map((o, i): EnumOption => {
    if (typeof o === 'string') {
      return { id: randomUUID(), name: o, color: null, ordinal: i };
    }
    const obj = o as Record<string, unknown>;
    return {
      id: (obj.id as string) ?? randomUUID(),
      name: (obj.name as string) ?? String(o),
      color: (obj.color as string | null) ?? null,
      ordinal: (obj.ordinal as number) ?? i,
    };
  });

  return { config: { ...cfg, options: normalized }, changed: true };
}
