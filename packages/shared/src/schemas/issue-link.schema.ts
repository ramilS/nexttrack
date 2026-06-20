import { z } from 'zod';
import { issueStatusSchema } from './issue.schema';

/**
 * Directional link vocabulary as seen by clients. Distinct from Prisma's
 * `IssueLinkType` (BLOCKS / DEPENDS_ON / DUPLICATES / RELATES_TO …): the API
 * maps a stored link + perspective into one of these directional labels. The
 * Prisma ↔ frontend mapping lives in the API (`issue-link.mapper.ts`) since it
 * depends on `@prisma/client`.
 */
export const FRONTEND_LINK_TYPES = [
  'BLOCKS',
  'IS_BLOCKED_BY',
  'RELATES_TO',
  'DUPLICATES',
  'IS_DUPLICATED_BY',
] as const;

export const frontendLinkTypeSchema = z.enum(FRONTEND_LINK_TYPES);
export type FrontendLinkType = z.infer<typeof frontendLinkTypeSchema>;

// ─── Request ─────────────────────────────────────────────────

export const createIssueLinkSchema = z.object({
  type: frontendLinkTypeSchema,
  targetIssueId: z.guid(),
});
export type CreateIssueLinkInput = z.infer<typeof createIssueLinkSchema>;

// ─── Response ────────────────────────────────────────────────

export const issueLinkSchema = z.object({
  id: z.guid(),
  // Raw stored link type (Prisma `IssueLinkType` value). Clients render by the
  // grouped directional `type` below, not this field.
  type: z.string(),
  direction: z.enum(['outward', 'inward']),
  linkedIssue: z.object({
    id: z.guid(),
    number: z.number().int(),
    projectKey: z.string(),
    title: z.string(),
    type: z.string(),
    // Nullable: the API returns null when the linked issue's status id is not
    // found in its project's default workflow.
    status: issueStatusSchema.nullable(),
  }),
  createdAt: z.iso.datetime(),
});
export type IssueLink = z.infer<typeof issueLinkSchema>;

export const groupedIssueLinksSchema = z.object({
  type: frontendLinkTypeSchema,
  links: z.array(issueLinkSchema),
});
export type GroupedIssueLinks = z.infer<typeof groupedIssueLinksSchema>;
