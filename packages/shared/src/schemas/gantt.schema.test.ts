import { describe, it, expect } from 'vitest';
import { ganttQuerySchema } from './gantt.schema';

describe('ganttQuerySchema', () => {
  it('defaults groupBy to NONE', () => {
    const r = ganttQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.groupBy).toBe('NONE');
  });

  it('accepts the uppercase enum values the web sends', () => {
    for (const g of ['NONE', 'ASSIGNEE', 'TYPE', 'SPRINT']) {
      expect(ganttQuerySchema.safeParse({ groupBy: g }).success).toBe(true);
    }
  });

  it('rejects the old lowercase casing', () => {
    expect(ganttQuerySchema.safeParse({ groupBy: 'assignee' }).success).toBe(false);
  });

  it('rejects a non-date from/to', () => {
    expect(ganttQuerySchema.safeParse({ from: '06/08/2026' }).success).toBe(false);
  });
});
