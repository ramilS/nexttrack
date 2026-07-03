import { EsQueryBuilderService } from './es-query-builder.service';
import {
  ParsedQuery,
  FilterValue,
} from '@repo/shared/query-language';

/**
 * Recursive object shape for the Elasticsearch query DSL the builder emits.
 * Every property access yields the same node type so the deeply-nested
 * assertions below stay readable without per-line casts.
 */
interface EsClause {
  [key: string]: EsClause;
}

interface EsQuery {
  query: { bool: { must: EsClause[]; filter: EsClause[] } };
  sort: EsClause;
  _source: EsClause;
  highlight: EsClause;
}

describe('EsQueryBuilderService', () => {
  let service: EsQueryBuilderService;

  const context = {
    currentUserId: 'user-1',
    accessibleProjectIds: ['proj-1', 'proj-2'],
  };

  const emptyParsed: ParsedQuery = {
    filters: [],
    sort: null,
    errors: [],
  };

  beforeEach(() => {
    service = new EsQueryBuilderService();
  });

  const fv = (
    raw: string,
    overrides?: Partial<FilterValue>,
  ): FilterValue => ({
    raw,
    isKeyword: false,
    isRange: false,
    isFuzzy: false,
    ...overrides,
  });

  // ─── Empty query ──────────────────────────────────────────────

  it('should return match_all with project and isDeleted filters for empty query', () => {
    const result = service.build(emptyParsed, context) as unknown as EsQuery;

    expect(result.query.bool.must).toEqual([{ match_all: {} }]);
    expect(result.query.bool.filter).toEqual(
      expect.arrayContaining([
        { terms: { projectId: ['proj-1', 'proj-2'] } },
        { term: { isDeleted: false } },
      ]),
    );
    expect(result.query.bool.filter).toHaveLength(2);
  });

  // ─── Text search ─────────────────────────────────────────────

  it('should build multi_match for plain text search', () => {
    const parsed: ParsedQuery = {
      filters: [
        { kind: 'TEXT_SEARCH', text: 'hello world', isExact: false, isFuzzy: false },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const must = result.query.bool.must;

    expect(must).toHaveLength(1);
    expect(must[0].multi_match).toBeDefined();
    expect(must[0].multi_match.query).toBe('hello world');
    expect(must[0].multi_match.fields).toEqual(['title^3', 'description', 'commentBodies']);
    expect(must[0].multi_match.type).toBe('best_fields');
    expect(must[0].multi_match.tie_breaker).toBe(0.3);
  });

  it('should build phrase multi_match for exact text search', () => {
    const parsed: ParsedQuery = {
      filters: [
        { kind: 'TEXT_SEARCH', text: 'exact phrase', isExact: true, isFuzzy: false },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const match = result.query.bool.must[0].multi_match;

    expect(match.type).toBe('phrase');
    expect(match.query).toBe('exact phrase');
  });

  it('should build fuzzy multi_match for fuzzy text search', () => {
    const parsed: ParsedQuery = {
      filters: [
        { kind: 'TEXT_SEARCH', text: 'fuzzy term', isExact: false, isFuzzy: true },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const match = result.query.bool.must[0].multi_match;

    expect(match.fuzziness).toBe('AUTO');
    expect(match.query).toBe('fuzzy term');
  });

  // ─── Issue identity (key / number) ───────────────────────────

  const textSearch = (text: string): ParsedQuery => ({
    filters: [{ kind: 'TEXT_SEARCH', text, isExact: false, isFuzzy: false }],
    sort: null,
    errors: [],
  });

  it('should boost an exact issue-key match (DEVX-61) above text search', () => {
    const result = service.build(textSearch('DEVX-61'), context) as unknown as EsQuery;
    const should = result.query.bool.must[0].bool.should as unknown as EsClause[];

    expect(should).toEqual(
      expect.arrayContaining([
        {
          bool: {
            must: [
              { term: { projectKey: { value: 'DEVX', case_insensitive: true } } },
              { term: { number: 61 } },
            ],
            boost: 50,
          },
        },
      ]),
    );
    expect(should.some((clause) => clause.multi_match !== undefined)).toBe(true);
  });

  it('should match an issue key case-insensitively (devx-61)', () => {
    const result = service.build(textSearch('devx-61'), context) as unknown as EsQuery;
    const should = result.query.bool.must[0].bool.should as unknown as EsClause[];

    expect(should).toEqual(
      expect.arrayContaining([
        {
          bool: {
            must: [
              { term: { projectKey: { value: 'devx', case_insensitive: true } } },
              { term: { number: 61 } },
            ],
            boost: 50,
          },
        },
      ]),
    );
  });

  it('should resolve a bare number to an issue when project-scoped', () => {
    const scopedContext = { ...context, scopedProjectId: 'proj-1' };
    const result = service.build(textSearch('61'), scopedContext) as unknown as EsQuery;
    const should = result.query.bool.must[0].bool.should as unknown as EsClause[];

    expect(should).toEqual(
      expect.arrayContaining([
        { bool: { must: [{ term: { number: 61 } }], boost: 50 } },
      ]),
    );
  });

  it('should treat a bare number as plain text search when not project-scoped', () => {
    const result = service.build(textSearch('61'), context) as unknown as EsQuery;
    const must = result.query.bool.must;

    expect(must[0].multi_match).toBeDefined();
    expect(must[0].multi_match.query).toBe('61');
    expect(must[0].bool).toBeUndefined();
  });

  it('should treat non-identity hyphenated text as plain text search', () => {
    const result = service.build(textSearch('foo-bar'), context) as unknown as EsQuery;
    const must = result.query.bool.must;

    expect(must[0].multi_match).toBeDefined();
    expect(must[0].multi_match.query).toBe('foo-bar');
    expect(must[0].bool).toBeUndefined();
  });

  // ─── Hashtags ─────────────────────────────────────────────────

  it('should build must_not exists resolvedAt for #unresolved', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'unresolved' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { bool: { must_not: [{ exists: { field: 'resolvedAt' } }] } },
      ]),
    );
  });

  it('should build exists resolvedAt for #resolved', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'resolved' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { exists: { field: 'resolvedAt' } },
      ]),
    );
  });

  it('should build term assigneeId for #myissues', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'myissues' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { term: { assigneeId: 'user-1' } },
      ]),
    );
  });

  it('should build exists assigneeId for #assigned', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'assigned' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { exists: { field: 'assigneeId' } },
      ]),
    );
  });

  it('should build must_not exists assigneeId for #unassigned', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'unassigned' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { bool: { must_not: [{ exists: { field: 'assigneeId' } }] } },
      ]),
    );
  });

  it('should build range dueDate lt now/d for #overdue', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'overdue' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { range: { dueDate: { lt: 'now/d' } } },
      ]),
    );
  });

  it('should build term memberIds for #starredby', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'starredby' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { term: { memberIds: 'user-1' } },
      ]),
    );
  });

  it('should produce no extra filter clauses for unknown hashtag', () => {
    const parsed: ParsedQuery = {
      filters: [{ kind: 'HASHTAG', name: 'nonexistent' }],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    // Only the base project + isDeleted filters
    expect(result.query.bool.filter).toHaveLength(2);
  });

  // ─── Field filters ───────────────────────────────────────────

  it('should resolve assignee:me to term assigneeId = currentUserId', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'assignee',
          operator: 'EQ',
          values: [fv('me')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { term: { assigneeId: 'user-1' } },
      ]),
    );
  });

  it('should build must_not exists for assignee:{unassigned}', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'assignee',
          operator: 'EQ',
          values: [fv('{unassigned}')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { bool: { must_not: [{ exists: { field: 'assigneeId' } }] } },
      ]),
    );
  });

  it('should build range query for date field with range value', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'created',
          operator: 'RANGE',
          values: [
            fv('', { isRange: true, rangeFrom: '2024-01-01', rangeTo: '2024-12-31' }),
          ],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { range: { createdAt: { gte: '2024-01-01', lte: '2024-12-31' } } },
      ]),
    );
  });

  it('should resolve "today" in date fields to now/d', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'created',
          operator: 'EQ',
          values: [fv('today')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { range: { createdAt: { gte: 'now/d', lte: 'now/d' } } },
      ]),
    );
  });

  it('should wrap negated field filter in must_not', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'priority',
          operator: 'EQ',
          values: [fv('HIGH')],
          negated: true,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { bool: { must_not: [{ term: { priority: 'HIGH' } }] } },
      ]),
    );
  });

  it('should build terms query for standard field with multiple values', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'priority',
          operator: 'IN',
          values: [fv('HIGH'), fv('CRITICAL')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    expect(filter).toEqual(
      expect.arrayContaining([
        { terms: { priority: ['HIGH', 'CRITICAL'] } },
      ]),
    );
  });

  // ─── Custom field filter ──────────────────────────────────────

  it('should build nested query for custom field filter', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'myCustomField',
          operator: 'EQ',
          values: [fv('someValue')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    const nested = filter.find((f) => f.nested);
    expect(nested).toBeDefined();
    expect(nested!.nested.path).toBe('customFields');
    expect(nested!.nested.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { 'customFields.fieldName': 'myCustomField' } },
        { term: { 'customFields.valueKeyword': 'someValue' } },
      ]),
    );
  });

  it('should use valueNumber for numeric custom field values', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'storyPoints',
          operator: 'EQ',
          values: [fv('5')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    const nested = filter.find((f) => f.nested);
    expect(nested!.nested.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { 'customFields.valueNumber': 5 } },
      ]),
    );
  });

  it('should build nested range query for custom field with range value', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'storyPoints',
          operator: 'RANGE',
          values: [fv('', { isRange: true, rangeFrom: '1', rangeTo: '10' })],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const nested = result.query.bool.filter.find((f) => f.nested);

    expect(nested!.nested.query.bool.filter).toEqual(
      expect.arrayContaining([
        {
          range: {
            'customFields.valueNumber': { gte: 1, lte: 10 },
          },
        },
      ]),
    );
  });

  // ─── User field with multiple values including null ───────────

  it('should build bool should for user field with multiple values including null', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'assignee',
          operator: 'IN',
          values: [fv('me'), fv('{unassigned}')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;
    const filter = result.query.bool.filter;

    const shouldClause = filter.find((f) => f.bool?.should);
    expect(shouldClause).toBeDefined();
    expect(shouldClause!.bool.should).toEqual(
      expect.arrayContaining([
        { terms: { assigneeId: ['user-1'] } },
        { bool: { must_not: [{ exists: { field: 'assigneeId' } }] } },
      ]),
    );
    expect(shouldClause!.bool.minimum_should_match).toBe(1);
  });

  // ─── Sort ─────────────────────────────────────────────────────

  it('should use _score desc, updatedAt desc when no sort node', () => {
    const result = service.build(emptyParsed, context) as unknown as EsQuery;

    expect(result.sort).toEqual([
      { _score: { order: 'desc' } },
      { updatedAt: { order: 'desc' } },
      { id: { order: 'desc' } },
    ]);
  });

  it('should use custom sort fields from sort node', () => {
    const parsed: ParsedQuery = {
      filters: [],
      sort: {
        kind: 'SORT',
        fields: [
          { field: 'created', direction: 'asc' },
          { field: 'priority', direction: 'desc' },
        ],
      },
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;

    expect(result.sort).toEqual([
      { createdAt: { order: 'asc' } },
      { priority: { order: 'desc' } },
      { id: { order: 'desc' } },
    ]);
  });

  // ─── Highlight ────────────────────────────────────────────────

  it('should include highlight configuration', () => {
    const result = service.build(emptyParsed, context) as unknown as EsQuery;

    expect(result.highlight).toBeDefined();
    expect(result.highlight.fields).toHaveProperty('title');
    expect(result.highlight.fields).toHaveProperty('description');
    expect(result.highlight.fields).toHaveProperty('commentBodies');
  });

  it('should set _source to true', () => {
    const result = service.build(emptyParsed, context) as unknown as EsQuery;
    expect(result._source).toBe(true);
  });

  // ─── Case-insensitive human keyword fields ────────────────────

  it('should build a case-insensitive term for a single status value', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'status',
          operator: 'EQ',
          values: [fv('open')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;

    expect(result.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { statusName: { value: 'open', case_insensitive: true } } },
      ]),
    );
  });

  it('should OR case-insensitive terms for multiple status values', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'status',
          operator: 'EQ',
          values: [fv('open'), fv('In Progress')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;

    expect(result.query.bool.filter).toEqual(
      expect.arrayContaining([
        {
          bool: {
            should: [
              { term: { statusName: { value: 'open', case_insensitive: true } } },
              {
                term: {
                  statusName: { value: 'In Progress', case_insensitive: true },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      ]),
    );
  });

  it('should match tags case-insensitively', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'tag',
          operator: 'EQ',
          values: [fv('backend')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;

    expect(result.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { tagNames: { value: 'backend', case_insensitive: true } } },
      ]),
    );
  });

  it('should keep priority (an enum) as an exact term', () => {
    const parsed: ParsedQuery = {
      filters: [
        {
          kind: 'FIELD_FILTER',
          field: 'priority',
          operator: 'EQ',
          values: [fv('HIGH')],
          negated: false,
        },
      ],
      sort: null,
      errors: [],
    };

    const result = service.build(parsed, context) as unknown as EsQuery;

    expect(result.query.bool.filter).toEqual(
      expect.arrayContaining([{ term: { priority: 'HIGH' } }]),
    );
  });
});
