import { describe, it, expect } from 'vitest';
import {
  formatSmartTimestamp,
  dateInputToIso,
  dateInputToEndOfDayIso,
  dateInputToEndOfDayIsoOrUndefined,
} from './dates';

describe('formatSmartTimestamp', () => {
  // Fixed reference point, local time: Thu 18 Jun 2026, 12:00:00
  const now = new Date(2026, 5, 18, 12, 0, 0);

  it('renders "now" for timestamps under a minute old', () => {
    const date = new Date(2026, 5, 18, 11, 59, 30); // 30s ago
    expect(formatSmartTimestamp(date, now)).toBe('now');
  });

  it('clamps future timestamps to "now"', () => {
    const date = new Date(2026, 5, 18, 13, 0, 0); // 1h in the future
    expect(formatSmartTimestamp(date, now)).toBe('now');
  });

  it('renders 24h time for an earlier moment on the same day', () => {
    const date = new Date(2026, 5, 18, 9, 5, 0);
    expect(formatSmartTimestamp(date, now)).toBe('09:05');
  });

  it('renders day + abbreviated month (no year) for an earlier day this year', () => {
    const date = new Date(2026, 5, 8, 14, 30, 0);
    expect(formatSmartTimestamp(date, now)).toBe('Jun 8');
  });

  it('renders day + abbreviated month + year for a previous year', () => {
    const date = new Date(2024, 0, 3, 14, 30, 0);
    expect(formatSmartTimestamp(date, now)).toBe('Jan 3, 2024');
  });

  it('accepts an ISO string', () => {
    const iso = new Date(2026, 5, 18, 9, 5, 0).toISOString();
    expect(formatSmartTimestamp(iso, now)).toBe('09:05');
  });

  it('defaults the reference point to the current time', () => {
    expect(formatSmartTimestamp(new Date())).toBe('now');
  });
});

describe('dateInputToEndOfDayIso', () => {
  it('resolves to 23:59:59.999 in local time on the chosen calendar day', () => {
    const result = new Date(dateInputToEndOfDayIso('2026-06-18'));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // June, 0-indexed
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('is a different instant than the UTC-midnight variant used for start-of-day fields', () => {
    expect(dateInputToEndOfDayIso('2026-06-18')).not.toBe(dateInputToIso('2026-06-18'));
  });
});

describe('dateInputToEndOfDayIsoOrUndefined', () => {
  it('returns undefined for empty input', () => {
    expect(dateInputToEndOfDayIsoOrUndefined('')).toBeUndefined();
  });

  it('delegates to dateInputToEndOfDayIso for non-empty input', () => {
    expect(dateInputToEndOfDayIsoOrUndefined('2026-06-18')).toBe(
      dateInputToEndOfDayIso('2026-06-18'),
    );
  });
});
