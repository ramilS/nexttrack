import { ConditionEvaluator, EvaluationContext } from './condition-evaluator';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  const makeContext = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
    issue: {
      type: 'BUG',
      priority: 'HIGH',
      statusId: 'st-open',
      statusCategory: 'UNSTARTED',
      assigneeId: 'user-1',
      tagIds: ['tag-1', 'tag-2'],
    },
    ...overrides,
  });

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  it('should return true for empty condition', () => {
    expect(evaluator.evaluate({}, makeContext())).toBe(true);
    expect(evaluator.evaluate(null, makeContext())).toBe(true);
  });

  it('should match type in list', () => {
    expect(evaluator.evaluate(
      { field: 'type', op: 'in', values: ['BUG', 'TASK'] },
      makeContext(),
    )).toBe(true);
  });

  it('should reject type not in list', () => {
    expect(evaluator.evaluate(
      { field: 'type', op: 'in', values: ['TASK', 'FEATURE'] },
      makeContext(),
    )).toBe(false);
  });

  it('should match type not_in', () => {
    expect(evaluator.evaluate(
      { field: 'type', op: 'not_in', values: ['TASK'] },
      makeContext(),
    )).toBe(true);
  });

  it('should match priority eq', () => {
    expect(evaluator.evaluate(
      { field: 'priority', op: 'eq', value: 'HIGH' },
      makeContext(),
    )).toBe(true);
  });

  it('should match priority gte', () => {
    expect(evaluator.evaluate(
      { field: 'priority', op: 'gte', value: 'MEDIUM' },
      makeContext(),
    )).toBe(true);
  });

  it('should reject priority lte when higher', () => {
    expect(evaluator.evaluate(
      { field: 'priority', op: 'lte', value: 'LOW' },
      makeContext(),
    )).toBe(false);
  });

  it('should match status eq', () => {
    expect(evaluator.evaluate(
      { field: 'status', op: 'eq', value: 'st-open' },
      makeContext(),
    )).toBe(true);
  });

  it('should match status.category', () => {
    expect(evaluator.evaluate(
      { field: 'status.category', op: 'eq', value: 'UNSTARTED' },
      makeContext(),
    )).toBe(true);
  });

  it('should match assignee is_not_empty', () => {
    expect(evaluator.evaluate(
      { field: 'assignee', op: 'is_not_empty' },
      makeContext(),
    )).toBe(true);
  });

  it('should match assignee is_empty', () => {
    expect(evaluator.evaluate(
      { field: 'assignee', op: 'is_empty' },
      makeContext({ issue: { ...makeContext().issue, assigneeId: null } }),
    )).toBe(true);
  });

  it('should match tag contains', () => {
    expect(evaluator.evaluate(
      { field: 'tag', op: 'contains', value: 'tag-1' },
      makeContext(),
    )).toBe(true);
  });

  it('should match tag not_contains', () => {
    expect(evaluator.evaluate(
      { field: 'tag', op: 'not_contains', value: 'tag-99' },
      makeContext(),
    )).toBe(true);
  });

  it('should evaluate AND conditions', () => {
    expect(evaluator.evaluate(
      { and: [
        { field: 'type', op: 'in', values: ['BUG'] },
        { field: 'priority', op: 'gte', value: 'HIGH' },
      ] },
      makeContext(),
    )).toBe(true);
  });

  it('should fail AND when one condition fails', () => {
    expect(evaluator.evaluate(
      { and: [
        { field: 'type', op: 'in', values: ['TASK'] },
        { field: 'priority', op: 'gte', value: 'HIGH' },
      ] },
      makeContext(),
    )).toBe(false);
  });

  it('should evaluate OR conditions', () => {
    expect(evaluator.evaluate(
      { or: [
        { field: 'type', op: 'in', values: ['TASK'] },
        { field: 'priority', op: 'eq', value: 'HIGH' },
      ] },
      makeContext(),
    )).toBe(true);
  });

  it('should match oldStatus for status change trigger', () => {
    expect(evaluator.evaluate(
      { field: 'oldStatus', op: 'eq', value: 'st-open' },
      makeContext({ oldStatusId: 'st-open' }),
    )).toBe(true);
  });

  it('should match newStatus for status change trigger', () => {
    expect(evaluator.evaluate(
      { field: 'newStatus', op: 'eq', value: 'st-done' },
      makeContext({ newStatusId: 'st-done' }),
    )).toBe(true);
  });
});
