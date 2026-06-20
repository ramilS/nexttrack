import { IssueLinkType } from '@prisma/client';
import type { FrontendLinkType } from '@repo/shared/schemas';

/**
 * Maps a client-facing directional link type to its stored Prisma
 * `IssueLinkType` plus whether source/target are flipped on write. Lives in the
 * API (not `@repo/shared`) because it depends on `@prisma/client`.
 */
export const FRONTEND_TO_PRISMA: Record<
  FrontendLinkType,
  { type: IssueLinkType; flip: boolean }
> = {
  BLOCKS: { type: IssueLinkType.BLOCKS, flip: false },
  IS_BLOCKED_BY: { type: IssueLinkType.DEPENDS_ON, flip: false },
  DUPLICATES: { type: IssueLinkType.DUPLICATES, flip: false },
  IS_DUPLICATED_BY: { type: IssueLinkType.DUPLICATES, flip: true },
  RELATES_TO: { type: IssueLinkType.RELATES_TO, flip: false },
};
