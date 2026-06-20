import { describe, it, expect } from 'vitest';
import { tokenize, TOKEN_CLASSES, type TokenType } from './query-tokenizer';

/** Convenience: the non-whitespace token (type, value) pairs. */
function tokenPairs(input: string): Array<[TokenType, string]> {
  return tokenize(input)
    .filter((t) => t.type !== 'whitespace')
    .map((t) => [t.type, t.value]);
}

describe('tokenize', () => {
  it('returns no tokens for an empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('classifies a known field token including its colon', () => {
    expect(tokenPairs('status:open')).toEqual([
      ['field', 'status:'],
      ['value', 'open'],
    ]);
  });

  it('treats an unknown field name as plain text without hanging', () => {
    const tokens = tokenize('foo:bar');
    // Must terminate (regression: a ':' after a non-field word once spun forever)
    // and every piece is plain text that reconstructs the original input.
    expect(tokens.every((t) => t.type === 'text')).toBe(true);
    expect(tokens.map((t) => t.value).join('')).toBe('foo:bar');
  });

  it('does not hang on a stray or trailing colon', () => {
    for (const input of ['foo:', ':', 'a:b:c', 'status']) {
      expect(tokenize(input).map((t) => t.value).join('')).toBe(input);
    }
  });

  it('keeps a quoted field value as a single quoted token', () => {
    expect(tokenPairs('status:"In Progress"')).toEqual([
      ['field', 'status:'],
      ['quoted', '"In Progress"'],
    ]);
  });

  it('recognizes hashtags', () => {
    expect(tokenPairs('#MyIssues')).toEqual([['hashtag', '#MyIssues']]);
  });

  it('recognizes the {me} keyword value of a field', () => {
    expect(tokenPairs('assignee:{me}')).toEqual([
      ['field', 'assignee:'],
      ['keyword', '{me}'],
    ]);
  });

  it('marks a negation prefix before a field', () => {
    const types = tokenize('-status:done')
      .filter((t) => t.type !== 'whitespace')
      .map((t) => t.type);
    expect(types[0]).toBe('negation');
    expect(types).toContain('field');
  });

  it('classifies a date value on a date field', () => {
    expect(tokenPairs('created:2024-01-01')).toEqual([
      ['field', 'created:'],
      ['date', '2024-01-01'],
    ]);
  });

  it('classifies relative date ranges', () => {
    expect(tokenPairs('updated:-7d..today')).toEqual([
      ['field', 'updated:'],
      ['date', '-7d..today'],
    ]);
  });

  it('handles the two-word "due date" field', () => {
    const tokens = tokenPairs('due date:today');
    expect(tokens[0]).toEqual(['field', 'due date:']);
  });

  it('preserves character offsets for highlighting', () => {
    const [field] = tokenize('status:open');
    expect(field).toMatchObject({ type: 'field', start: 0, end: 7 });
  });

  it('round-trips the original text by concatenating token values', () => {
    const input = 'login bug status:"In Progress" assignee:{me} #MyIssues';
    expect(tokenize(input).map((t) => t.value).join('')).toBe(input);
  });
});

describe('TOKEN_CLASSES', () => {
  it('has a class entry for every token type produced', () => {
    const input = 'login status:"In Progress" -type:bug created:today #X ~fuzzy';
    for (const token of tokenize(input)) {
      expect(TOKEN_CLASSES).toHaveProperty(token.type);
    }
  });
});
