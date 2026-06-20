import { describe, it, expect } from 'vitest';
import { createSprintSchema, sprintIssuesSchema } from './sprint.schema';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const EARLIER = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

describe('createSprintSchema date range', () => {
  it('accepts endDate after startDate', () => {
    const result = createSprintSchema.safeParse({
      name: 'Sprint 1',
      startDate: EARLIER,
      endDate: LATER,
    });
    expect(result.success).toBe(true);
  });

  it('rejects endDate before/equal to startDate, with the endDate path', () => {
    const result = createSprintSchema.safeParse({
      name: 'Sprint 1',
      startDate: LATER,
      endDate: EARLIER,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['endDate']);
      expect(result.error.issues[0].message).toBe('endDate must be after startDate');
    }
  });

  it('accepts a sprint with no dates (both optional)', () => {
    expect(createSprintSchema.safeParse({ name: 'Sprint 1' }).success).toBe(true);
  });

  it('rejects non-ISO datetime strings', () => {
    expect(
      createSprintSchema.safeParse({ name: 'S', startDate: '2026-01-01' }).success,
    ).toBe(false);
  });
});

describe('sprintIssuesSchema', () => {
  it('accepts distinct issue ids', () => {
    expect(sprintIssuesSchema.safeParse({ issueIds: [A, B] }).success).toBe(true);
  });

  it('rejects duplicate issue ids', () => {
    expect(sprintIssuesSchema.safeParse({ issueIds: [A, A] }).success).toBe(false);
  });

  it('rejects an empty issue list', () => {
    expect(sprintIssuesSchema.safeParse({ issueIds: [] }).success).toBe(false);
  });
});
