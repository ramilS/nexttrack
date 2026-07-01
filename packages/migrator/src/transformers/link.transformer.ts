export type FrontendLinkType =
  | 'BLOCKS'
  | 'IS_BLOCKED_BY'
  | 'RELATES_TO'
  | 'DUPLICATES'
  | 'IS_DUPLICATED_BY';

interface LinkTypeMapping {
  outward: FrontendLinkType | null;
  inward: FrontendLinkType | null;
  symmetric?: boolean;
}

// Keyed by YouTrack linkType.name (default instance names — verify against the
// source instance during the pilot). Subtask is null: parent-child is handled
// by the dedicated parent-links phase, not as a generic link.
const YT_LINKTYPE_MAP: Record<string, LinkTypeMapping> = {
  Depend: { outward: 'BLOCKS', inward: 'IS_BLOCKED_BY' },
  Duplicate: { outward: 'DUPLICATES', inward: 'IS_DUPLICATED_BY' },
  Relates: { outward: 'RELATES_TO', inward: null, symmetric: true },
  Subtask: { outward: null, inward: null },
};

/**
 * Maps a YouTrack link (type name + direction) to the target link type.
 * Returns null when the link must be skipped: unknown type, subtask, or the
 * INWARD side of a symmetric link (each symmetric pair is emitted once, from
 * the OUTWARD/BOTH side, to avoid double-creation).
 */
export function mapYtLink(
  linkTypeName: string,
  direction: 'OUTWARD' | 'INWARD' | 'BOTH',
): FrontendLinkType | null {
  const entry = YT_LINKTYPE_MAP[linkTypeName];
  if (!entry) return null;
  if (entry.symmetric) return direction === 'INWARD' ? null : entry.outward;
  return direction === 'INWARD' ? entry.inward : entry.outward;
}
