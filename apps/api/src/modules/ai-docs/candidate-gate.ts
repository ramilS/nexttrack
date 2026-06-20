import { IssueType } from '@prisma/client';
import type { TiptapDoc } from '@repo/shared/schemas';

const DOC_WORTHY_TYPES = new Set<IssueType>([
  IssueType.FEATURE,
  IssueType.BUG,
  IssueType.STORY,
]);

export function hasDocContent(doc: TiptapDoc | null): boolean {
  return Array.isArray(doc?.content) && doc.content.length > 0;
}

/**
 * Cheap gate that decides whether a resolved issue is even worth an LLM call:
 * an explicit trigger tag, or a heuristic (a feature/bug/story that carries a
 * description). Keeps the AI off the long tail of trivial closes.
 */
export function isDocCandidate(params: {
  type: IssueType;
  description: TiptapDoc | null;
  tagNames: string[];
  triggerTag: string;
}): boolean {
  const trigger = params.triggerTag.toLowerCase();
  const tagged = params.tagNames.some((n) => n.toLowerCase() === trigger);
  const heuristic =
    DOC_WORTHY_TYPES.has(params.type) && hasDocContent(params.description);
  return tagged || heuristic;
}
