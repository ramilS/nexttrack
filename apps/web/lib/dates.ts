import { format, isSameDay, isSameYear } from 'date-fns';

const ONE_MINUTE_MS = 60 * 1000;

/**
 * YouTrack-style timestamp label that escalates with age:
 * - under a minute (or in the future) -> "now"
 * - earlier the same day -> 24h time, e.g. "09:05"
 * - earlier this year -> abbreviated month + day, e.g. "Jun 8"
 * - a previous year -> abbreviated month + day + year, e.g. "Jan 3, 2024"
 *
 * `now` is injectable so the escalation is deterministic in tests.
 */
export function formatSmartTimestamp(date: string | Date, now: Date = new Date()): string {
  const value = typeof date === 'string' ? new Date(date) : date;

  if (now.getTime() - value.getTime() < ONE_MINUTE_MS) return 'now';
  if (isSameDay(value, now)) return format(value, 'HH:mm');
  if (isSameYear(value, now)) return format(value, 'MMM d');
  return format(value, 'MMM d, yyyy');
}

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to an ISO 8601 datetime
 * that backend Zod schemas using `.datetime()` accept.
 *
 * Uses UTC midnight to keep the same calendar day across timezones.
 */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/**
 * Same as `dateInputToIso` but returns `undefined` for empty input.
 */
export function dateInputToIsoOrUndefined(value: string): string | undefined {
  return value ? dateInputToIso(value) : undefined;
}

/**
 * Convert an ISO datetime string back to `YYYY-MM-DD` for binding to
 * `<input type="date">`. Returns `''` for nullish input.
 */
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}
