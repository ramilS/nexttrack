import { describe, it, expect } from 'vitest';
import {
  CONDITION_FIELDS,
  CONDITION_FIELD_OPS,
  conditionOperandFor,
  conditionOpsFor,
  createWorkflowRuleSchema,
  defaultConditionOpFor,
  workflowConditionSchema,
} from './workflow-rule.schema';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

function rule(conditions: unknown) {
  return {
    workflowId: VALID_UUID,
    name: 'Rule',
    trigger: 'ON_CREATE',
    conditions,
    actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
  };
}

describe('condition DSL table', () => {
  it('covers every field, and every field offers at least one operator', () => {
    for (const field of CONDITION_FIELDS) {
      expect(conditionOpsFor(field).length).toBeGreaterThan(0);
      expect(() => defaultConditionOpFor(field)).not.toThrow();
    }
    expect(Object.keys(CONDITION_FIELD_OPS).sort()).toEqual([...CONDITION_FIELDS].sort());
  });

  it('tolerates values outside the enums, because the evaluator reads stored JSON', () => {
    expect(conditionOpsFor('nope')).toEqual([]);
    expect(conditionOperandFor('nope', 'eq')).toBeUndefined();
    expect(conditionOperandFor('type', 'made_up')).toBeUndefined();
  });
});

describe('workflowConditionSchema', () => {
  it.each([
    ['type in values', { field: 'type', op: 'in', values: ['BUG'] }],
    ['priority neq', { field: 'priority', op: 'neq', value: 'LOW' }],
    ['assignee is_empty without an operand', { field: 'assignee', op: 'is_empty' }],
    ['tag contains', { field: 'tag', op: 'contains', value: VALID_UUID }],
    ['a nested and/or tree', {
      and: [
        { field: 'type', op: 'in', values: ['BUG'] },
        { or: [{ field: 'priority', op: 'gte', value: 'HIGH' }] },
      ],
    }],
  ])('accepts %s', (_name, condition) => {
    expect(workflowConditionSchema.safeParse(condition).success).toBe(true);
  });

  // Each of these used to be storable, and each then matched EVERY issue,
  // because the evaluator returned "matches" for a condition it could not read.
  it.each([
    ['an operator the field does not support', { field: 'type', op: 'eq', value: 'BUG' }],
    ['is_empty on a field that is never empty', { field: 'status', op: 'is_empty' }],
    ['a required value left blank', { field: 'status', op: 'eq', value: '' }],
    ['a required value omitted', { field: 'status', op: 'eq' }],
    ['an empty values list', { field: 'type', op: 'in', values: [] }],
    ['values omitted where a list is required', { field: 'type', op: 'in' }],
  ])('rejects %s', (_name, condition) => {
    expect(workflowConditionSchema.safeParse(condition).success).toBe(false);
  });

  it('names the field and the supported operators when it rejects', () => {
    const result = workflowConditionSchema.safeParse({
      field: 'type',
      op: 'eq',
      value: 'BUG',
    });

    expect(result.success).toBe(false);
    const message = result.success ? '' : result.error.issues[0].message;
    expect(message).toContain('"eq"');
    expect(message).toContain('"type"');
    expect(message).toContain('in, not_in');
  });
});

describe('createWorkflowRuleSchema', () => {
  it('rejects a rule whose condition cannot be evaluated', () => {
    expect(
      createWorkflowRuleSchema.safeParse(
        rule({ field: 'priority', op: 'contains', value: 'HIGH' }),
      ).success,
    ).toBe(false);
  });

  it('rejects an unevaluatable leaf nested inside an and/or tree', () => {
    expect(
      createWorkflowRuleSchema.safeParse(
        rule({ and: [{ field: 'assignee', op: 'gte', value: VALID_UUID }] }),
      ).success,
    ).toBe(false);
  });

  it('accepts a rule built from the table', () => {
    expect(
      createWorkflowRuleSchema.safeParse(
        rule({ field: 'type', op: 'not_in', values: ['TASK'] }),
      ).success,
    ).toBe(true);
  });
});
