import { describe, it, expect } from 'vitest';
import {
  createTimeLogSchema,
  timeReportQuerySchema,
} from './time-tracking.schema';

describe('createTimeLogSchema', () => {
  it('accepts a date-only string and a numeric duration', () => {
    const r = createTimeLogSchema.safeParse({ duration: 90, date: '2026-06-08' });
    expect(r.success).toBe(true);
  });

  it('accepts a full ISO date-time and a duration string', () => {
    const r = createTimeLogSchema.safeParse({
      duration: '1h 30m',
      date: '2026-06-08T10:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      createTimeLogSchema.safeParse({ duration: 5, date: '08/06/2026' }).success,
    ).toBe(false);
  });

  it('rejects a zero/negative numeric duration', () => {
    expect(createTimeLogSchema.safeParse({ duration: 0 }).success).toBe(false);
  });
});

describe('timeReportQuerySchema', () => {
  it('coerces paging, normalizes a single userId to an array, and applies defaults', () => {
    const r = timeReportQuerySchema.safeParse({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      userIds: 'u1',
      page: '2',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.userIds).toEqual(['u1']);
      expect(r.data.page).toBe(2);
      expect(r.data.perPage).toBe(50);
      expect(r.data.groupBy).toBe('USER');
    }
  });

  it('rejects an inverted date range', () => {
    expect(
      timeReportQuerySchema.safeParse({
        dateFrom: '2026-06-30',
        dateTo: '2026-06-01',
      }).success,
    ).toBe(false);
  });
});
