import { z } from 'zod';
import { userSummarySchema, uniqueUuidArray } from './common.schema';
import { issueTypeSchema, issuePrioritySchema } from './issue.schema';

export const AUTO_ASSIGN_RULE_NAME_MAX = 100;

export const ASSIGN_STRATEGIES = [
  'SPECIFIC_USER',
  'ROUND_ROBIN_TEAM',
  'LEAST_LOADED_TEAM',
  'PROJECT_LEAD',
] as const;
export const assignStrategySchema = z.enum(ASSIGN_STRATEGIES);
export type AssignStrategy = z.infer<typeof assignStrategySchema>;

// ─── Conditions ──────────────────────────────────────────────

export const autoAssignConditionsSchema = z.object({
  issueType: z.array(issueTypeSchema).optional(),
  priority: z.array(issuePrioritySchema).optional(),
  tagIds: uniqueUuidArray().optional(),
});
export type AutoAssignConditions = z.infer<typeof autoAssignConditionsSchema>;

// ─── Request schemas ─────────────────────────────────────────

export const createAutoAssignRuleSchema = z.object({
  name: z.string().trim().min(1).max(AUTO_ASSIGN_RULE_NAME_MAX),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  conditions: autoAssignConditionsSchema,
  strategy: assignStrategySchema,
  assigneeId: z.guid().optional(),
  teamId: z.guid().optional(),
});
export type CreateAutoAssignRuleInput = z.input<typeof createAutoAssignRuleSchema>;
export type CreateAutoAssignRuleParsed = z.infer<typeof createAutoAssignRuleSchema>;

export const updateAutoAssignRuleSchema = z.object({
  name: z.string().trim().min(1).max(AUTO_ASSIGN_RULE_NAME_MAX).optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  conditions: autoAssignConditionsSchema.optional(),
  strategy: assignStrategySchema.optional(),
  assigneeId: z.guid().nullable().optional(),
  teamId: z.guid().nullable().optional(),
});
export type UpdateAutoAssignRuleInput = z.infer<typeof updateAutoAssignRuleSchema>;

export const previewAutoAssignSchema = z.object({
  type: issueTypeSchema,
  priority: issuePrioritySchema,
  tagIds: uniqueUuidArray().optional(),
});
export type PreviewAutoAssignInput = z.infer<typeof previewAutoAssignSchema>;

// ─── Response schemas ─────────────────────────────────────────

const teamSummarySchema = z.object({
  id: z.guid(),
  name: z.string(),
});

export const autoAssignRuleSchema = z.object({
  id: z.guid(),
  name: z.string(),
  isEnabled: z.boolean(),
  priority: z.number().int(),
  conditions: autoAssignConditionsSchema,
  strategy: assignStrategySchema,
  assigneeId: z.guid().nullable(),
  teamId: z.guid().nullable(),
  /** Populated when strategy targets a specific user. */
  assignee: userSummarySchema.nullable(),
  /** Populated when strategy targets a team. */
  team: teamSummarySchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AutoAssignRule = z.infer<typeof autoAssignRuleSchema>;

export const autoAssignPreviewSchema = z.object({
  matched: z.boolean(),
  assignee: userSummarySchema.nullable(),
  rule: z
    .object({
      id: z.guid(),
      name: z.string(),
    })
    .nullable(),
});
export type AutoAssignPreview = z.infer<typeof autoAssignPreviewSchema>;
