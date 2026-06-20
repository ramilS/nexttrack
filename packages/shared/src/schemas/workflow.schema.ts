import { z } from 'zod';

export const WORKFLOW_NAME_MAX = 100;
export const WORKFLOW_STATUS_NAME_MAX = 50;
export const WORKFLOW_TRANSITION_NAME_MAX = 100;
export const WORKFLOW_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const WORKFLOW_STATUS_CATEGORIES = ['UNSTARTED', 'STARTED', 'DONE'] as const;
export const workflowStatusCategorySchema = z.enum(WORKFLOW_STATUS_CATEGORIES);
export type WorkflowStatusCategory = z.infer<typeof workflowStatusCategorySchema>;

export const WORKFLOW_TRANSITION_ROLES = ['OWNER', 'DEVELOPER', 'VIEWER'] as const;
export const workflowTransitionRoleSchema = z.enum(WORKFLOW_TRANSITION_ROLES);
export type WorkflowTransitionRole = z.infer<typeof workflowTransitionRoleSchema>;

// ─── Status / Transition shapes ───────────────────────────────

export const workflowStatusSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(WORKFLOW_STATUS_NAME_MAX),
  color: z.string().regex(WORKFLOW_COLOR_REGEX),
  category: workflowStatusCategorySchema,
  isInitial: z.boolean(),
  isResolved: z.boolean(),
  ordinal: z.number().int().min(0),
});
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const workflowTransitionSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(WORKFLOW_TRANSITION_NAME_MAX),
  fromStatusId: z.string(),
  toStatusId: z.string(),
  requiredRole: workflowTransitionRoleSchema.nullable(),
});
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;

// ─── Request schemas ─────────────────────────────────────────

const createWorkflowStatusSchema = workflowStatusSchema.extend({
  id: z.guid().optional(),
});

const createWorkflowTransitionSchema = workflowTransitionSchema.extend({
  id: z.guid().optional(),
  requiredRole: workflowTransitionRoleSchema.nullable().default(null),
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(WORKFLOW_NAME_MAX),
  statuses: z.array(createWorkflowStatusSchema).min(1),
  transitions: z.array(createWorkflowTransitionSchema).default([]),
});
export type CreateWorkflowInput = z.input<typeof createWorkflowSchema>;
export type CreateWorkflowParsed = z.infer<typeof createWorkflowSchema>;

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(WORKFLOW_NAME_MAX).optional(),
  statuses: z.array(workflowStatusSchema),
  transitions: z.array(workflowTransitionSchema),
  migrateStatusMapping: z
    .record(z.guid(), z.guid())
    .optional(),
});
export type UpdateWorkflowInput = z.input<typeof updateWorkflowSchema>;
export type UpdateWorkflowParsed = z.infer<typeof updateWorkflowSchema>;

// ─── Response schema ─────────────────────────────────────────

export const workflowSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  isDefault: z.boolean(),
  statuses: z.array(workflowStatusSchema),
  transitions: z.array(workflowTransitionSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Workflow = z.infer<typeof workflowSchema>;
