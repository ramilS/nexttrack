import { describe, it, expect } from 'vitest';
import { createIssueSchema, bulkUpdateIssuesSchema } from './issue.schema';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('createIssueSchema', () => {
  it('trims the title and applies type/priority defaults', () => {
    const result = createIssueSchema.safeParse({ title: '  My issue  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My issue');
      expect(result.data.type).toBe('TASK');
      expect(result.data.priority).toBe('MEDIUM');
    }
  });

  it('rejects an empty/whitespace-only title', () => {
    expect(createIssueSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('enforces estimate bounds', () => {
    expect(createIssueSchema.safeParse({ title: 'x', estimate: 0 }).success).toBe(false);
    expect(createIssueSchema.safeParse({ title: 'x', estimate: 10000 }).success).toBe(false);
    expect(createIssueSchema.safeParse({ title: 'x', estimate: 5 }).success).toBe(true);
  });

  it('rejects duplicate tagIds', () => {
    expect(createIssueSchema.safeParse({ title: 'x', tagIds: [A, A] }).success).toBe(false);
    expect(createIssueSchema.safeParse({ title: 'x', tagIds: [A, B] }).success).toBe(true);
  });
});

describe('bulkUpdateIssuesSchema', () => {
  it('rejects duplicate issueIds', () => {
    expect(
      bulkUpdateIssuesSchema.safeParse({ issueIds: [A, A], update: {} }).success,
    ).toBe(false);
  });

  it('rejects an empty issueIds list', () => {
    expect(
      bulkUpdateIssuesSchema.safeParse({ issueIds: [], update: {} }).success,
    ).toBe(false);
  });

  it('accepts distinct issueIds with an update payload', () => {
    expect(
      bulkUpdateIssuesSchema.safeParse({ issueIds: [A, B], update: { priority: 'HIGH' } })
        .success,
    ).toBe(true);
  });
});
