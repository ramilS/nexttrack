import { z } from 'zod';
import { userSummarySchema, uniqueUuidArray } from './common.schema';

export const TEAM_NAME_MAX = 100;
export const TEAM_DESCRIPTION_MAX = 1000;
export const TEAM_ADD_MEMBERS_MAX = 50;

// ─── Request schemas ─────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(TEAM_NAME_MAX),
  description: z.string().max(TEAM_DESCRIPTION_MAX).optional(),
  leadId: z.guid().optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(TEAM_NAME_MAX).optional(),
  description: z.string().max(TEAM_DESCRIPTION_MAX).nullable().optional(),
  leadId: z.guid().nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMembersSchema = z.object({
  userIds: uniqueUuidArray({ min: 1, max: TEAM_ADD_MEMBERS_MAX }),
});
export type AddTeamMembersInput = z.infer<typeof addTeamMembersSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const teamMemberSchema = userSummarySchema.extend({
  joinedAt: z.iso.datetime(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({
  id: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  projectId: z.guid(),
  lead: userSummarySchema.nullable(),
  members: z.array(teamMemberSchema),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Team = z.infer<typeof teamSchema>;
