import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration, formatElapsed } from './duration-input';

describe('parseDuration', () => {
  it('returns null for empty string', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('  ')).toBeNull();
  });

  it('parses plain minutes', () => {
    expect(parseDuration('120')).toBe(120);
  });

  it('parses hours and minutes', () => {
    expect(parseDuration('2h 30m')).toBe(150);
  });

  it('parses days', () => {
    expect(parseDuration('1d')).toBe(480); // 8 * 60
  });

  it('parses weeks', () => {
    expect(parseDuration('1w')).toBe(2400); // 5 * 8 * 60
  });

  it('parses combined units', () => {
    expect(parseDuration('1w 2d 3h 15m')).toBe(2400 + 960 + 180 + 15);
  });

  it('handles decimal values', () => {
    expect(parseDuration('1.5h')).toBe(90);
  });

  it('returns null for invalid input', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('hello world')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(parseDuration('2H 30M')).toBe(150);
  });
});

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(150)).toBe('2h 30m');
  });

  it('formats days', () => {
    expect(formatDuration(480)).toBe('1d');
  });

  it('formats weeks', () => {
    expect(formatDuration(2400)).toBe('1w');
  });

  it('formats complex durations', () => {
    expect(formatDuration(2400 + 480 + 60 + 15)).toBe('1w 1d 1h 15m');
  });
});

describe('formatElapsed', () => {
  it('formats seconds to HH:MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(61)).toBe('00:01:01');
    expect(formatElapsed(3661)).toBe('01:01:01');
  });
});
