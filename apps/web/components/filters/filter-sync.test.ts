import { describe, it, expect } from 'vitest';
import {
  parseQueryToFilters,
  buildQueryFromFilters,
  DEFAULT_SEARCH_FILTERS,
  type SearchFilters,
} from './filter-sync';

/**
 * `useSearchState.setQuery` does `setState(parseQueryToFilters(typed))`, and
 * nuqs `setState` is a PARTIAL MERGE over the previous state. These tests model
 * that merge so the round-trip the controlled textarea relies on is exercised
 * directly.
 */
function applyTypedQuery(prev: SearchFilters, typed: string): SearchFilters {
  return { ...prev, ...parseQueryToFilters(typed) };
}

describe('parseQueryToFilters → buildQueryFromFilters round-trip', () => {
  it('clears a field when its value is deleted instead of resurrecting it', () => {
    // User has typed "status:O" → state holds status:"O".
    const afterTyping = applyTypedQuery(DEFAULT_SEARCH_FILTERS, 'status:O');
    expect(buildQueryFromFilters(afterTyping)).toBe('status:O');

    // User presses Delete once more → textarea text is now "status:".
    const afterDelete = applyTypedQuery(afterTyping, 'status:');

    // The box must shrink toward empty, NOT duplicate the stale field.
    expect(buildQueryFromFilters(afterDelete)).not.toContain('status:O');
    expect(buildQueryFromFilters(afterDelete)).toBe('status:');
  });

  it('clears a fully-typed field once its token is removed from the text', () => {
    const withField = applyTypedQuery(DEFAULT_SEARCH_FILTERS, 'bug status:open');
    expect(buildQueryFromFilters(withField)).toContain('status:open');

    // User selects the "status:open" part and deletes it, leaving just "bug ".
    const cleared = applyTypedQuery(withField, 'bug ');
    expect(buildQueryFromFilters(cleared)).toBe('bug');
  });
});

describe('quoted multi-word values', () => {
  it('parses a quoted assignee value containing spaces', () => {
    const filters = parseQueryToFilters('assignee:"John Doe"');
    expect(filters.assignee).toBe('John Doe');
    expect(filters.q).toBe('');
  });

  it('parses a quoted tag value containing spaces', () => {
    const filters = parseQueryToFilters('tag:"needs review"');
    expect(filters.tag).toBe('needs review');
    expect(filters.q).toBe('');
  });

  it('round-trips a quoted value back to the same query string', () => {
    const original = 'assignee:"John Doe"';
    expect(buildQueryFromFilters(parseQueryToFilters(original))).toBe(original);
  });

  it('keeps free text separate from a quoted field value', () => {
    const filters = parseQueryToFilters('login bug assignee:"Jane Roe" status:open');
    expect(filters.q).toBe('login bug');
    expect(filters.assignee).toBe('Jane Roe');
    expect(filters.status).toBe('open');
  });

  it('is idempotent: parsing a rebuilt query yields identical filters', () => {
    const once = parseQueryToFilters('bug assignee:"John Doe" status:open tag:"needs review"');
    const twice = parseQueryToFilters(buildQueryFromFilters(once));
    expect(twice).toEqual(once);
  });

  it('clears a quoted field when its token is deleted', () => {
    const withField = applyTypedQuery(DEFAULT_SEARCH_FILTERS, 'assignee:"John Doe"');
    expect(buildQueryFromFilters(withField)).toBe('assignee:"John Doe"');

    const cleared = applyTypedQuery(withField, '');
    expect(buildQueryFromFilters(cleared)).toBe('');
  });
});

describe('sort is expressed through the query-language, not a structured filter', () => {
  // The backend DSL owns sorting via "sort by: <field> <dir>". The frontend must
  // pass that clause through verbatim (as free text) rather than re-encoding it,
  // so the search box and the ES query speak the same syntax.
  it('keeps a "sort by:" clause as free text through the round-trip', () => {
    const filters = parseQueryToFilters('status:open sort by: created desc');
    expect(filters.status).toBe('open');
    expect(filters.q).toBe('sort by: created desc');
    expect(buildQueryFromFilters(filters)).toBe('sort by: created desc status:open');
  });

  it('does not extract the legacy "sort:field:dir" colon form into a structured field', () => {
    const filters = parseQueryToFilters('sort:created:desc');
    expect(filters.q).toBe('sort:created:desc');
  });
});

describe('status is a workflow-status name, not an enum', () => {
  // ES indexes statusName as a case-sensitive keyword holding the human name
  // ("Open", "In Progress"). Upper-casing it (as we do for the priority/type
  // enums) makes the term filter never match.
  it('preserves the status name verbatim instead of upper-casing it', () => {
    expect(parseQueryToFilters('status:Open').status).toBe('Open');
    expect(parseQueryToFilters('status:"In Progress"').status).toBe('In Progress');
  });

  it('still upper-cases the priority and type enums', () => {
    expect(parseQueryToFilters('priority:low').priority).toBe('LOW');
    expect(parseQueryToFilters('type:bug').type).toBe('BUG');
  });

  it('quotes a multi-word status when rebuilding the query', () => {
    expect(buildQueryFromFilters({ status: 'In Progress' })).toBe('status:"In Progress"');
  });

  it('round-trips a multi-word status', () => {
    const original = 'status:"In Progress"';
    expect(buildQueryFromFilters(parseQueryToFilters(original))).toBe(original);
  });
});