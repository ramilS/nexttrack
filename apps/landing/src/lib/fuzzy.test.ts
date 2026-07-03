import { describe, it, expect } from 'vitest';
import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null when characters are missing', () => {
    expect(fuzzyScore('xyz', 'Open GitHub repo')).toBeNull();
  });

  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('ogr', 'Open GitHub repo')).not.toBeNull();
  });

  it('returns 0 for an empty query (matches everything)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('ranks word-start matches above mid-word matches', () => {
    const wordStart = fuzzyScore('git', 'Copy git clone command');
    const midWord = fuzzyScore('git', 'digital');
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!).toBeGreaterThan(midWord!);
  });
});
