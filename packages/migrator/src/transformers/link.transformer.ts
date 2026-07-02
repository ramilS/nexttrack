import { YtIssueLink } from '../youtrack/types/yt-issue.type';

export type FrontendLinkType =
  | 'BLOCKS'
  | 'IS_BLOCKED_BY'
  | 'RELATES_TO'
  | 'DUPLICATES'
  | 'IS_DUPLICATED_BY';

// YouTrack has no native parent field — issue hierarchy is the aggregation
// ("Subtask") link. An issue's parent is the target of its INWARD side
// ("subtask of"); the OUTWARD side ("parent for") points at its children.
//
// Match by the type name OR its presentation strings ("parent for" /
// "subtask of"), since the internal linkType.name can be renamed per instance
// while the presentation stays. Case-insensitive.
function isSubtaskLinkType(linkType: {
  name?: string;
  sourceToTarget?: string;
  targetToSource?: string;
}): boolean {
  const parts = [linkType.name, linkType.sourceToTarget, linkType.targetToSource]
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.toLowerCase());
  return parts.some((s) => s === 'subtask' || s.includes('subtask') || s.includes('parent'));
}

export function resolveParentYtId(
  links: YtIssueLink[] | undefined,
): string | null {
  const parentLink = (links ?? []).find(
    (link) => link.direction === 'INWARD' && isSubtaskLinkType(link.linkType),
  );
  return parentLink?.issues[0]?.id ?? null;
}

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
