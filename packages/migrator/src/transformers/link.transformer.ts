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

// Keyed by YouTrack linkType.name (default instance names — verify against the
// source instance during the pilot). Maps to the OUTWARD-side target type only.
// Subtask is null: parent-child is handled by the dedicated parent-links phase,
// not as a generic link.
const YT_LINKTYPE_OUTWARD: Record<string, FrontendLinkType | null> = {
  Depend: 'BLOCKS',
  Duplicate: 'DUPLICATES',
  Relates: 'RELATES_TO',
  Subtask: null,
};

/**
 * Maps a YouTrack link (type name + direction) to the target link type.
 *
 * Emits ONLY from the OUTWARD (or symmetric BOTH) side; INWARD always returns
 * null. YouTrack returns a directed link on BOTH endpoints (OUTWARD on the
 * source, INWARD on the target), so creating from both sides makes two rows for
 * one relationship — e.g. BLOCKS(A→B) from A's outward AND DEPENDS_ON(B→A) from
 * B's inward — which both render as "is blocked by A" on B. The target stores a
 * single directed row and renders the inverse perspective itself, so one
 * outward-side create is exactly right. Also returns null for unknown types and
 * Subtask (handled by the parent-links phase).
 */
export function mapYtLink(
  linkTypeName: string,
  direction: 'OUTWARD' | 'INWARD' | 'BOTH',
): FrontendLinkType | null {
  if (direction === 'INWARD') return null;
  return YT_LINKTYPE_OUTWARD[linkTypeName] ?? null;
}
