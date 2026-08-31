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

  it('matches when no filter is expressed at all', () => {
    expect(evaluator.evaluate({}, makeContext())).toBe(true);
    expect(evaluator.evaluate(null, makeContext())).toBe(true);
    expect(evaluator.evaluate({ and: [] }, makeContext())).toBe(true);
  });

  // The regression these guard: every one of these conditions used to evaluate
  // to TRUE, so a rule the author wrote as a narrow filter fired on every issue
  // in the project. "Cannot read it" must never mean "matches".
  describe('fails closed on a condition it cannot evaluate', () => {
    it.each([
      ['an operator the field does not support', { field: 'type', op: 'eq', value: 'BUG' }],
      ['is_empty on a field that is never empty', { field: 'status', op: 'is_empty' }],
      ['a missing single value', { field: 'status', op: 'eq' }],
      ['an empty values list', { field: 'type', op: 'in', values: [] }],
      ['a values list where a value is required', { field: 'status', op: 'eq', values: ['st-open'] }],
      ['an unknown field', { field: 'nope', op: 'eq', value: 'x' }],
      ['a leaf with no field', { op: 'eq', value: 'x' }],
      ['a priority outside the known ranks', { field: 'priority', op: 'gte', value: 'URGENT' }],
      ['a non-object condition', 'always'],
    ])('%s', (_name, condition) => {
      expect(evaluator.evaluate(condition, makeContext())).toBe(false);
    });

    it('does not let an unreadable branch satisfy an OR', () => {
      expect(
        evaluator.evaluate(
          { or: [{ field: 'type', op: 'eq', value: 'BUG' }] },
          makeContext(),
        ),
      ).toBe(false);
    });
  });

  it('supports neq on every field that offers it', () => {
    const ctx = makeContext();
    expect(evaluator.evaluate({ field: 'priority', op: 'neq', value: 'LOW' }, ctx)).toBe(true);
    expect(evaluator.evaluate({ field: 'priority', op: 'neq', value: 'HIGH' }, ctx)).toBe(false);
    expect(evaluator.evaluate({ field: 'status', op: 'neq', value: 'st-done' }, ctx)).toBe(true);
    expect(evaluator.evaluate({ field: 'assignee', op: 'neq', value: 'user-2' }, ctx)).toBe(true);
    expect(evaluator.evaluate({ field: 'assignee', op: 'neq', value: 'user-1' }, ctx)).toBe(false);
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
