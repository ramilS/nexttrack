import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { ParsedQuery } from './ast.types';

function parse(query: string): ParsedQuery {
  return new Parser(new Lexer(query).tokenize()).parse();
}

describe('query-language sort parsing (frontend contract)', () => {
  // The web client expresses sort exclusively through this DSL — there is no
  // separate sort dropdown/param. `buildQueryFromFilters` emits the free-text
  // clause "sort by: <field> <dir>" inside `q`, so these strings ARE the
  // contract the search box ships to the backend. Locking them here guards
  // against a recurrence of the frontend/backend sort-syntax drift.

  it('parses a single-field "sort by:" clause', () => {
    const parsed = parse('sort by: created desc');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.sort).toEqual({
      kind: 'SORT',
      fields: [{ field: 'created', direction: 'desc' }],
    });
  });

  it('defaults the direction to asc when omitted', () => {
    const parsed = parse('sort by: priority');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.sort?.fields).toEqual([{ field: 'priority', direction: 'asc' }]);
  });

  it('parses a multi-field sort', () => {
    const parsed = parse('sort by: created desc, priority asc');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.sort?.fields).toEqual([
      { field: 'created', direction: 'desc' },
      { field: 'priority', direction: 'asc' },
    ]);
  });

  it('parses a sort clause that PRECEDES a field filter (the build output order)', () => {
    // buildQueryFromFilters pushes free-text `q` (carrying the sort) first, then
    // the structured filters — so this exact ordering must keep both intact.
    const parsed = parse('sort by: created desc status:open');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.sort?.fields).toEqual([
      { field: 'created', direction: 'desc' },
    ]);
    const statusFilter = parsed.filters.find(
      (f) => f.kind === 'FIELD_FILTER' && f.field === 'status',
    );
    expect(statusFilter).toBeDefined();
  });

  it('parses a sort clause that FOLLOWS a field filter', () => {
    const parsed = parse('status:open sort by: created desc');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.sort?.fields).toEqual([
      { field: 'created', direction: 'desc' },
    ]);
    const statusFilter = parsed.filters.find(
      (f) => f.kind === 'FIELD_FILTER' && f.field === 'status',
    );
    expect(statusFilter).toBeDefined();
  });
});
