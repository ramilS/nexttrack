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
  if (!isRecord(config)) {
    return { config: {}, changed: config !== null && config !== undefined };
  }
  const cfg = config;
  if (!Array.isArray(cfg.options)) {
    return { config: cfg, changed: false };
  }

  const options = cfg.options as unknown[];
  const normalized: EnumOption[] = [];
  let changed = false;
  options.forEach((option, ordinal) => {
    if (isValidModernOption(option)) {
      normalized.push(option);
      return;
    }
    const name = typeof option === 'string'
      ? option
      : isRecord(option) && typeof option.name === 'string'
        ? option.name
        : null;
    if (!name) {
      changed = true;
      return;
    }
    const object = isRecord(option) ? option : undefined;
    const color = object && (typeof object.color === 'string' || object.color === null)
      ? object.color
      : null;
    const optionOrdinal = object && typeof object.ordinal === 'number' && Number.isFinite(object.ordinal)
      ? object.ordinal
      : ordinal;
    normalized.push({
      id: hasOptionId(option) ? option.id : legacyOptionId(fieldId, name, ordinal),
      name,
      color,
      ordinal: optionOrdinal,
    });
    changed = true;
  });
  if (!changed) return { config: cfg, changed: false };

  return { config: { ...cfg, options: normalized }, changed: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidModernOption(option: unknown): option is EnumOption {
  if (!isRecord(option) || !hasOptionId(option)) return false;
  const record = option as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (typeof record.color === 'string' || record.color === null) &&
    typeof record.ordinal === 'number' &&
    Number.isFinite(record.ordinal)
  );
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
