import { parsePeriodString, formatPeriod } from './period-parser';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 480;
const MINUTES_PER_WEEK = 2400;

describe('parsePeriodString', () => {
  it('should parse a full period string "2w 3d 4h 30m"', () => {
    const result = parsePeriodString('2w 3d 4h 30m');

    expect(result).toBe(
      2 * MINUTES_PER_WEEK +
        3 * MINUTES_PER_DAY +
        4 * MINUTES_PER_HOUR +
        30,
    );
  });

  it('should parse weeks only', () => {
    expect(parsePeriodString('1w')).toBe(MINUTES_PER_WEEK);
  });

  it('should parse days only', () => {
    expect(parsePeriodString('2d')).toBe(2 * MINUTES_PER_DAY);
  });

  it('should parse hours only', () => {
    expect(parsePeriodString('5h')).toBe(5 * MINUTES_PER_HOUR);
  });

  it('should parse minutes only', () => {
    expect(parsePeriodString('45m')).toBe(45);
  });

  it('should parse weeks and minutes without middle units', () => {
    expect(parsePeriodString('1w 15m')).toBe(MINUTES_PER_WEEK + 15);
  });

  it('should return null for empty string', () => {
    expect(parsePeriodString('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(parsePeriodString('   ')).toBeNull();
  });

  it('should return null for "0w" (all zeros)', () => {
    expect(parsePeriodString('0w')).toBeNull();
  });

  it('should return null for "0w 0d 0h 0m"', () => {
    expect(parsePeriodString('0w 0d 0h 0m')).toBeNull();
  });

  it('should return null for invalid format', () => {
    expect(parsePeriodString('abc')).toBeNull();
  });

  it('should return null for unsupported units', () => {
    expect(parsePeriodString('2y')).toBeNull();
  });

  it('should be case-insensitive', () => {
    expect(parsePeriodString('1W 2D')).toBe(
      MINUTES_PER_WEEK + 2 * MINUTES_PER_DAY,
    );
  });

  it('should handle leading/trailing whitespace', () => {
    expect(parsePeriodString('  3h  ')).toBe(3 * MINUTES_PER_HOUR);
  });
});

describe('formatPeriod', () => {
  it('should format 0 as "0m"', () => {
    expect(formatPeriod(0)).toBe('0m');
  });

  it('should format exact minutes', () => {
    expect(formatPeriod(30)).toBe('30m');
  });

  it('should format exact hours', () => {
    expect(formatPeriod(MINUTES_PER_HOUR)).toBe('1h');
  });

  it('should format exact days', () => {
    expect(formatPeriod(MINUTES_PER_DAY)).toBe('1d');
  });

  it('should format exact weeks', () => {
    expect(formatPeriod(MINUTES_PER_WEEK)).toBe('1w');
  });

  it('should format a mixed period', () => {
    const total =
      1 * MINUTES_PER_WEEK +
      2 * MINUTES_PER_DAY +
      3 * MINUTES_PER_HOUR +
      15;

    expect(formatPeriod(total)).toBe('1w 2d 3h 15m');
  });

  it('should omit zero components', () => {
    const total = 1 * MINUTES_PER_WEEK + 30;
    expect(formatPeriod(total)).toBe('1w 30m');
  });

  it('should format hours and minutes without days or weeks', () => {
    expect(formatPeriod(90)).toBe('1h 30m');
  });

  it('should format multiple weeks', () => {
    expect(formatPeriod(3 * MINUTES_PER_WEEK)).toBe('3w');
  });
});
