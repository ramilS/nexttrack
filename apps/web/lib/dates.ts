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
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to the ISO 8601
 * instant marking the END of that day, in the browser's local timezone.
 *
 * For an expiry date this is the meaning that cannot surprise a user:
 * picking "today" keeps the key valid through the rest of today as the
 * user experiences it, rather than expiring it at UTC midnight (already in
 * the past for every timezone east of UTC). Using the *local* end of day —
 * not the UTC one — matters at the edges too: for a timezone behind UTC,
 * UTC 23:59:59 falls before local midnight, which would expire the key
 * hours before the user's day is actually over.
 */
export function dateInputToEndOfDayIso(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date input: "${value}"`);
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

/**
 * Same as `dateInputToEndOfDayIso` but returns `undefined` for empty input.
 */
export function dateInputToEndOfDayIsoOrUndefined(value: string): string | undefined {
  return value ? dateInputToEndOfDayIso(value) : undefined;
}

/**
 * Convert an ISO datetime string back to `YYYY-MM-DD` for binding to
 * `<input type="date">`. Returns `''` for nullish input.
 */
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}
