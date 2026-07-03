import { describe, it, expect } from 'vitest';
import { Lexer, Parser } from '@repo/shared/query-language';
import { MOCK_ISSUES } from './mock-issues';
import { applyQuery } from './query-evaluator';

function run(query: string): string[] {
  const parsed = new Parser(new Lexer(query).tokenize()).parse();
  expect(parsed.errors).toHaveLength(0);
  return applyQuery(MOCK_ISSUES, parsed).map((i) => i.key);
}

describe('applyQuery', () => {
  it('filters by quoted status value', () => {
    expect(run('status: "In Review"')).toEqual(['NT-103', 'NT-111']);
  });

  it('treats multiple comma values as IN', () => {
    expect(run('priority: Urgent, High')).toEqual([
      'NT-101', 'NT-103', 'NT-105', 'NT-107', 'NT-109', 'NT-112',
    ]);
  });

  it('resolves the "me" keyword to the demo current user', () => {
    expect(run('assignee: me')).toEqual(['NT-101', 'NT-103', 'NT-107', 'NT-112']);
  });

  it('supports quoted "{unassigned}" as IS_EMPTY', () => {
    // Verified against the real parser: the UNQUOTED form `assignee: {unassigned}`
    // is a parse error (the lexer reads {...} as a bracketed FIELD name) — the
    // keyword only works quoted. Do not "fix" this in the demo; it matches the product.
    expect(run('assignee: "{unassigned}"')).toEqual(['NT-104', 'NT-109']);
  });

  it('negates a value with a dash', () => {
    const keys = run('status: -Done');
    expect(keys).toHaveLength(10);
    expect(keys).not.toContain('NT-106');
    expect(keys).not.toContain('NT-108');
  });

  it('matches a hashtag against tags', () => {
    expect(run('#backend')).toEqual(['NT-101', 'NT-103']);
  });

  it('treats #unresolved as "not Done"', () => {
    const keys = run('#unresolved');
    expect(keys).toHaveLength(10);
    expect(keys).not.toContain('NT-106');
  });

  it('runs free text as a title substring search', () => {
    expect(run('reindex')).toEqual(['NT-103']);
  });

  it('combines filters with AND semantics', () => {
    expect(run('assignee: me priority: Urgent')).toEqual(['NT-103', 'NT-107', 'NT-112']);
  });

  it('sorts by created desc (newest first)', () => {
    expect(run('type: Bug sort by: created desc')).toEqual([
      'NT-112', 'NT-103', 'NT-101', 'NT-109', 'NT-106',
    ]);
  });

  it('sorts by priority desc (most severe first)', () => {
    expect(run('assignee: me sort by: priority desc')).toEqual([
      'NT-103', 'NT-107', 'NT-112', 'NT-101',
    ]);
  });

  it('field values match case-insensitively', () => {
    expect(run('priority: urgent')).toEqual(['NT-103', 'NT-107', 'NT-112']);
  });

  it('does not mutate the input array when sorting', () => {
    const before = [...MOCK_ISSUES];
    run('sort by: created desc');
    expect(MOCK_ISSUES).toEqual(before);
  });
});
