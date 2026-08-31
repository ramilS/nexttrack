import { z } from 'zod';
import { userSummarySchema } from './common.schema';
import { issuePrioritySchema, issueTypeSchema } from './issue.schema';

export const WORKFLOW_RULE_NAME_MAX = 200;

export const WORKFLOW_TRIGGERS = [
  'ON_CREATE',
  'ON_STATUS_CHANGE',
  'ON_FIELD_CHANGE',
  'ON_COMMENT',
  'ON_SCHEDULE',
  'ON_DUE_DATE',
] as const;
export const workflowTriggerSchema = z.enum(WORKFLOW_TRIGGERS);
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;

// ─── Condition DSL ───────────────────────────────────────────

export const CONDITION_FIELDS = [
  'type',
  'priority',
  'status',
  'status.category',
  'assignee',
  'tag',
  'oldStatus',
  'newStatus',
] as const;
export const conditionFieldSchema = z.enum(CONDITION_FIELDS);
export type ConditionField = z.infer<typeof conditionFieldSchema>;

export const CONDITION_OPS = [
  'eq',
  'neq',
  'in',
  'not_in',
  'gte',
  'lte',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
] as const;
export const conditionOpSchema = z.enum(CONDITION_OPS);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

/** Which operand an operator needs: a single `value`, a `values` list, or none. */
export type ConditionOperand = 'value' | 'values' | 'none';

/**
 * The condition DSL, in one table.
 *
 * This is the contract three places used to restate independently — the leaf
 * schema (which accepted any field × any op), `ConditionEvaluator`, and the
 * rule-form UI's own op list — and they had drifted apart in five ways. Every
 * mismatch failed OPEN: the evaluator returned "matches" for a combination it
 * could not read, so a rule the author wrote as a narrow filter quietly applied
 * to every issue in the project.
 *
 * Adding an operator therefore means adding it here, and implementing it in the
 * evaluator; the schema and the UI both derive from this table.
 */
export const CONDITION_FIELD_OPS = {
  type: { in: 'values', not_in: 'values' },
  priority: { eq: 'value', neq: 'value', gte: 'value', lte: 'value' },
  status: { eq: 'value', neq: 'value' },
  'status.category': { eq: 'value', neq: 'value' },
  // The only field that can legitimately be absent on an issue.
  assignee: { eq: 'value', neq: 'value', is_empty: 'none', is_not_empty: 'none' },
  tag: { contains: 'value', not_contains: 'value' },
  oldStatus: { eq: 'value', neq: 'value' },
  newStatus: { eq: 'value', neq: 'value' },
} as const satisfies Record<
  ConditionField,
  Partial<Record<ConditionOp, ConditionOperand>>
>;

type FieldOps = Partial<Record<ConditionOp, ConditionOperand>>;

/**
 * Both lookups tolerate values outside the enums: the evaluator calls them with
 * whatever JSON is stored on the rule, and a `TypeError` there would propagate
 * out of an event listener and retry the whole event rather than skipping one
 * unreadable condition.
 */
function fieldOps(field: string): FieldOps | undefined {
  return (CONDITION_FIELD_OPS as Record<string, FieldOps>)[field];
}

export function conditionOpsFor(field: string): ConditionOp[] {
  return Object.keys(fieldOps(field) ?? {}) as ConditionOp[];
}

export function conditionOperandFor(
  field: string,
  op: string,
): ConditionOperand | undefined {
  return fieldOps(field)?.[op as ConditionOp];
}

/**
 * The operator a UI should preselect when the user picks a field. Every field in
 * the table has at least one, so an empty list is a broken table, not a case to
 * fall back from — falling back to `eq` would offer `type eq …`, which is
 * exactly the unevaluatable combination this table exists to prevent.
 */
export function defaultConditionOpFor(field: ConditionField): ConditionOp {
  const [first] = conditionOpsFor(field);
  if (!first) {
    throw new Error(`CONDITION_FIELD_OPS has no operators for field "${field}"`);
  }
  return first;
}

const conditionLeafSchema = z
  .object({
    field: conditionFieldSchema,
    op: conditionOpSchema,
    value: z.string().optional(),
    values: z.array(z.string()).optional(),
  })
  .superRefine((leaf, ctx) => {
    const operand = conditionOperandFor(leaf.field, leaf.op);
    if (!operand) {
      ctx.addIssue({
        code: 'custom',
        path: ['op'],
        message: `Operator "${leaf.op}" is not supported for field "${leaf.field}" (supported: ${conditionOpsFor(leaf.field).join(', ')})`,
      });
      return;
    }

    if (operand === 'value' && (leaf.value === undefined || leaf.value === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Operator "${leaf.op}" requires a value`,
      });
    }

    if (operand === 'values' && (leaf.values === undefined || leaf.values.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: `Operator "${leaf.op}" requires a non-empty values list`,
      });
    }
  });
export type ConditionLeaf = z.infer<typeof conditionLeafSchema>;

export type WorkflowCondition =
  | ConditionLeaf
  | { and: WorkflowCondition[] }
  | { or: WorkflowCondition[] };

export const workflowConditionSchema: z.ZodType<WorkflowCondition> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(workflowConditionSchema) }),
    z.object({ or: z.array(workflowConditionSchema) }),
    conditionLeafSchema,
  ]),
);

// ─── Action DSL ──────────────────────────────────────────────

export const ACTION_TYPES = [
  'SET_STATUS',
  'SET_ASSIGNEE',
  'SET_PRIORITY',
  'SET_TYPE',
  'ADD_TAG',
  'REMOVE_TAG',
  'ADD_COMMENT',
  'MOVE_TO_SPRINT',
  'SET_DUE_DATE',
  'BLOCK_TRANSITION',
] as const;
export const actionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const TRIGGER_USER_SENTINEL = '$TRIGGER_USER';

const setStatusActionSchema = z.object({
  type: z.literal('SET_STATUS'),
  statusId: z.guid(),
});
const setAssigneeActionSchema = z.object({
  type: z.literal('SET_ASSIGNEE'),
  userId: z.union([z.guid(), z.literal(TRIGGER_USER_SENTINEL)]),
});
const setPriorityActionSchema = z.object({
  type: z.literal('SET_PRIORITY'),
  priority: issuePrioritySchema,
});
const setTypeActionSchema = z.object({
  type: z.literal('SET_TYPE'),
  issueType: issueTypeSchema,
});
const addTagActionSchema = z.object({
  type: z.literal('ADD_TAG'),
  tagId: z.guid(),
});
const removeTagActionSchema = z.object({
  type: z.literal('REMOVE_TAG'),
  tagId: z.guid(),
});
const addCommentActionSchema = z.object({
  type: z.literal('ADD_COMMENT'),
  body: z.string().trim().min(1).max(10_000),
});
const moveToSprintActionSchema = z.object({
  type: z.literal('MOVE_TO_SPRINT'),
  sprintId: z.guid(),
});
const setDueDateActionSchema = z.object({
  type: z.literal('SET_DUE_DATE'),
  offsetDays: z.number().int().min(-365).max(365),
});
const blockTransitionActionSchema = z.object({
  type: z.literal('BLOCK_TRANSITION'),
  message: z.string().trim().min(1).max(500),
});

export const workflowActionSchema = z.discriminatedUnion('type', [
  setStatusActionSchema,
  setAssigneeActionSchema,
  setPriorityActionSchema,
  setTypeActionSchema,
  addTagActionSchema,
  removeTagActionSchema,
  addCommentActionSchema,
  moveToSprintActionSchema,
  setDueDateActionSchema,
  blockTransitionActionSchema,
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

const conditionSchema = workflowConditionSchema;
const actionSchema = workflowActionSchema;

// ─── Request schemas ─────────────────────────────────────────

export const createWorkflowRuleSchema = z.object({
  workflowId: z.guid(),
  name: z.string().trim().min(1).max(WORKFLOW_RULE_NAME_MAX),
  description: z.string().optional(),
  trigger: workflowTriggerSchema,
  conditions: conditionSchema,
  actions: z.array(actionSchema).min(1),
  priority: z.number().int().min(0).default(0),
});
export type CreateWorkflowRuleInput = z.input<typeof createWorkflowRuleSchema>;
export type CreateWorkflowRuleParsed = z.infer<typeof createWorkflowRuleSchema>;

export const updateWorkflowRuleSchema = z.object({
  name: z.string().trim().min(1).max(WORKFLOW_RULE_NAME_MAX).optional(),
  description: z.string().optional(),
  trigger: workflowTriggerSchema.optional(),
  conditions: conditionSchema.optional(),
  actions: z.array(actionSchema).min(1).optional(),
  priority: z.number().int().min(0).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateWorkflowRuleInput = z.infer<typeof updateWorkflowRuleSchema>;

export const testWorkflowRuleSchema = z.object({
  issue: z.object({
    type: z.string().min(1),
    priority: z.string().min(1),
    statusId: z.guid(),
    statusCategory: z.string().min(1).optional(),
    assigneeId: z.guid().nullable().optional(),
    tagIds: z.array(z.guid()).optional(),
  }),
});
export type TestWorkflowRuleInput = z.infer<typeof testWorkflowRuleSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const workflowRuleSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  workflowId: z.guid(),
  workflow: z.object({
    id: z.guid(),
    name: z.string(),
  }),
  name: z.string(),
  description: z.string().nullable(),
  isEnabled: z.boolean(),
  trigger: workflowTriggerSchema,
  conditions: workflowConditionSchema,
  actions: z.array(workflowActionSchema),
  priority: z.number().int(),
  createdBy: userSummarySchema,
  executionCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WorkflowRule = z.infer<typeof workflowRuleSchema>;

/**
 * Raw execution row as currently returned by the backend. Note that
 * `success: boolean` / `duration` / `triggeredBy` are the actual fields —
 * the frontend ExecutionLog UI consumes a richer shape that doesn't exist
 * yet (see Group 14). Until repair, this is the truthful contract.
 */
export const workflowRuleExecutionSchema = z.object({
  id: z.guid(),
  ruleId: z.guid(),
  issueId: z.guid(),
  triggeredBy: z.guid(),
  success: z.boolean(),
  error: z.string().nullable(),
  duration: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type WorkflowRuleExecution = z.infer<typeof workflowRuleExecutionSchema>;

export const workflowRuleDryRunSchema = z.object({
  matches: z.boolean(),
  actions: z.array(workflowActionSchema),
});
export type WorkflowRuleDryRun = z.infer<typeof workflowRuleDryRunSchema>;
