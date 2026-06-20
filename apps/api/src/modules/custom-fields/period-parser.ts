const PERIOD_REGEX = /^((\d+)w\s*)?((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?$/i;

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = DAYS_PER_WEEK * MINUTES_PER_DAY;

export function parsePeriodString(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const match = trimmed.match(PERIOD_REGEX);
  if (!match) return null;

  const weeks = parseInt(match[2] || '0');
  const days = parseInt(match[4] || '0');
  const hours = parseInt(match[6] || '0');
  const minutes = parseInt(match[8] || '0');

  if (weeks === 0 && days === 0 && hours === 0 && minutes === 0) return null;

  return (
    weeks * MINUTES_PER_WEEK +
    days * MINUTES_PER_DAY +
    hours * MINUTES_PER_HOUR +
    minutes
  );
}

export function formatPeriod(totalMinutes: number): string {
  let remaining = totalMinutes;

  const w = Math.floor(remaining / MINUTES_PER_WEEK);
  remaining %= MINUTES_PER_WEEK;
  const d = Math.floor(remaining / MINUTES_PER_DAY);
  remaining %= MINUTES_PER_DAY;
  const h = Math.floor(remaining / MINUTES_PER_HOUR);
  const m = remaining % MINUTES_PER_HOUR;

  const parts = [
    w && `${w}w`,
    d && `${d}d`,
    h && `${h}h`,
    m && `${m}m`,
  ].filter(Boolean);

  return parts.join(' ') || '0m';
}
