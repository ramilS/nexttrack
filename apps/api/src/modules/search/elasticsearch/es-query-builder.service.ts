import { Injectable } from '@nestjs/common';
import {
  ParsedQuery,
  FieldFilterNode,
  TextSearchNode,
  HashtagNode,
  SortNode,
  FilterValue,
} from '@repo/shared/query-language';

interface QueryContext {
  currentUserId: string;
  accessibleProjectIds: string[];
  // Set when the search is restricted to a single project; enables resolving a
  // bare issue number (e.g. "61") to that project's issue.
  scopedProjectId?: string;
}

// Issue identity shorthand: "DEVX-61" → projectKey + number, "61" → number.
// Project keys are >=2 chars (project-key Zod schema), so a non-matching string
// simply falls through to normal text search.
const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]+)-(\d+)$/;
const ISSUE_NUMBER_PATTERN = /^\d+$/;
// Large enough to dominate `_score` so the exact issue ranks first.
const ISSUE_KEY_MATCH_BOOST = 50;

const FIELD_MAP: Record<string, string> = {
  assignee: 'assigneeId',
  reporter: 'reporterId',
  priority: 'priority',
  type: 'type',
  status: 'statusName',
  tag: 'tagNames',
  project: 'projectKey',
  created: 'createdAt',
  updated: 'updatedAt',
  resolved: 'resolvedAt',
  'due date': 'dueDate',
  estimate: 'estimate',
  spent: 'spent',
};

const USER_FIELDS = new Set(['assignee', 'reporter']);
const DATE_FIELDS = new Set(['created', 'updated', 'due date', 'resolved']);

// Keyword fields holding a human, free-cased value (status/tag names, project
// keys) — matched case-insensitively. Enums and ID fields stay exact.
const CASE_INSENSITIVE_FIELDS = new Set(['statusName', 'tagNames', 'projectKey']);

@Injectable()
export class EsQueryBuilderService {
  build(parsedQuery: ParsedQuery, context: QueryContext): object {
    const mustClauses: object[] = [];
    const filterClauses: object[] = [];

    filterClauses.push({
      terms: { projectId: context.accessibleProjectIds },
    });
    filterClauses.push({ term: { isDeleted: false } });

    for (const node of parsedQuery.filters) {
      switch (node.kind) {
        case 'TEXT_SEARCH':
          mustClauses.push(this.buildTextSearch(node, context));
          break;
        case 'HASHTAG':
          filterClauses.push(
            ...this.buildHashtag(node, context),
          );
          break;
        case 'FIELD_FILTER': {
          const clause = this.buildFieldFilter(node, context);
          if (node.negated) {
            filterClauses.push({ bool: { must_not: [clause] } });
          } else {
            filterClauses.push(clause);
          }
          break;
        }
      }
    }

    return {
      query: {
        bool: {
          must: mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
          filter: filterClauses,
        },
      },
      sort: this.buildSort(parsedQuery.sort),
      highlight: {
        fields: {
          title: { number_of_fragments: 0 },
          description: { fragment_size: 150, number_of_fragments: 2 },
          commentBodies: { fragment_size: 150, number_of_fragments: 2 },
        },
      },
      _source: true,
    };
  }

  private buildTextSearch(node: TextSearchNode, context: QueryContext): object {
    const fields = ['title^3', 'description', 'commentBodies'];

    if (node.isExact) {
      return { multi_match: { query: node.text, type: 'phrase', fields } };
    }

    if (node.isFuzzy) {
      return { multi_match: { query: node.text, fuzziness: 'AUTO', fields } };
    }

    const textMatch = {
      multi_match: {
        query: node.text,
        fields,
        type: 'best_fields',
        tie_breaker: 0.3,
      },
    };

    const identityMatch = this.buildIssueIdentityMatch(node.text, context);
    if (identityMatch) {
      return {
        bool: { should: [identityMatch, textMatch], minimum_should_match: 1 },
      };
    }

    return textMatch;
  }

  // Returns null when the text is not an issue identity, so the caller falls
  // through to ordinary text search.
  private buildIssueIdentityMatch(
    text: string,
    context: QueryContext,
  ): object | null {
    const keyMatch = text.match(ISSUE_KEY_PATTERN);
    if (keyMatch) {
      const [, projectKey, number] = keyMatch;
      return {
        bool: {
          must: [
            this.termClause('projectKey', projectKey),
            { term: { number: Number(number) } },
          ],
          boost: ISSUE_KEY_MATCH_BOOST,
        },
      };
    }

    if (context.scopedProjectId && ISSUE_NUMBER_PATTERN.test(text)) {
      return {
        bool: {
          must: [{ term: { number: Number(text) } }],
          boost: ISSUE_KEY_MATCH_BOOST,
        },
      };
    }

    return null;
  }

  private buildHashtag(
    node: HashtagNode,
    context: QueryContext,
  ): object[] {
    const name = node.name.toLowerCase();

    switch (name) {
      case 'unresolved':
        return [{ bool: { must_not: [{ exists: { field: 'resolvedAt' } }] } }];
      case 'resolved':
        return [{ exists: { field: 'resolvedAt' } }];
      case 'myissues':
        return [{ term: { assigneeId: context.currentUserId } }];
      case 'assigned':
        return [{ exists: { field: 'assigneeId' } }];
      case 'unassigned':
        return [{ bool: { must_not: [{ exists: { field: 'assigneeId' } }] } }];
      case 'overdue':
        return [{ range: { dueDate: { lt: 'now/d' } } }];
      case 'starredby':
        return [{ term: { memberIds: context.currentUserId } }];
      default:
        return [];
    }
  }

  private buildFieldFilter(
    node: FieldFilterNode,
    context: QueryContext,
  ): object {
    const fieldLower = node.field.toLowerCase();
    const esField = FIELD_MAP[fieldLower];

    if (USER_FIELDS.has(fieldLower)) {
      return this.buildUserFilter(node.values, esField, context);
    }

    if (DATE_FIELDS.has(fieldLower)) {
      return this.buildDateFilter(esField, node.values);
    }

    // Custom field (not in FIELD_MAP)
    if (!esField) {
      return this.buildCustomFieldFilter(node.field, node.values);
    }

    // Standard field
    if (node.values.length === 1 && !node.values[0].isRange) {
      const resolved = this.resolveValue(node.values[0], context);
      if (resolved === null) {
        return { bool: { must_not: [{ exists: { field: esField } }] } };
      }
      return this.termClause(esField, resolved);
    }

    if (node.values.length > 1) {
      const resolved = node.values
        .map((v) => this.resolveValue(v, context))
        .filter((v): v is string => v !== null);
      if (CASE_INSENSITIVE_FIELDS.has(esField)) {
        // `terms` has no case_insensitive option — OR together single terms.
        return {
          bool: {
            should: resolved.map((v) => this.termClause(esField, v)),
            minimum_should_match: 1,
          },
        };
      }
      return { terms: { [esField]: resolved } };
    }

    if (node.values[0]?.isRange) {
      return this.buildDateFilter(esField, node.values);
    }

    return { match_all: {} };
  }

  private termClause(esField: string, value: string): object {
    if (CASE_INSENSITIVE_FIELDS.has(esField)) {
      return { term: { [esField]: { value, case_insensitive: true } } };
    }
    return { term: { [esField]: value } };
  }

  private buildUserFilter(
    values: FilterValue[],
    esField: string,
    context: QueryContext,
  ): object {
    const resolvedIds = values.map((v) => {
      if (v.raw.toLowerCase() === 'me') return context.currentUserId;
      if (
        v.raw.toLowerCase() === '{unassigned}' ||
        v.raw.toLowerCase() === '{no value}'
      ) {
        return null;
      }
      return v.raw;
    });

    const hasNull = resolvedIds.includes(null);
    const ids = resolvedIds.filter((id) => id !== null) as string[];

    if (hasNull && ids.length === 0) {
      return { bool: { must_not: [{ exists: { field: esField } }] } };
    }

    if (ids.length === 1 && !hasNull) {
      return { term: { [esField]: ids[0] } };
    }

    const should: object[] = [];
    if (ids.length > 0) should.push({ terms: { [esField]: ids } });
    if (hasNull) {
      should.push({ bool: { must_not: [{ exists: { field: esField } }] } });
    }
    return { bool: { should, minimum_should_match: 1 } };
  }

  private buildDateFilter(esField: string, values: FilterValue[]): object {
    const v = values[0];
    if (!v) return { match_all: {} };

    if (v.isRange) {
      return {
        range: {
          [esField]: {
            ...(v.rangeFrom && { gte: this.resolveDate(v.rangeFrom) }),
            ...(v.rangeTo && { lte: this.resolveDate(v.rangeTo) }),
          },
        },
      };
    }

    const date = this.resolveDate(v.raw);
    return { range: { [esField]: { gte: date, lte: date } } };
  }

  private buildCustomFieldFilter(
    fieldName: string,
    values: FilterValue[],
  ): object {
    const filter: object[] = [
      { term: { 'customFields.fieldName': fieldName } },
    ];

    if (values[0]?.isRange) {
      filter.push({
        range: {
          'customFields.valueNumber': {
            ...(values[0].rangeFrom && { gte: Number(values[0].rangeFrom) }),
            ...(values[0].rangeTo && { lte: Number(values[0].rangeTo) }),
          },
        },
      });
    } else {
      const rawValues = values.map((v) => v.raw);
      if (rawValues.length === 1) {
        // Try number first, then keyword
        const num = Number(rawValues[0]);
        if (!isNaN(num)) {
          filter.push({ term: { 'customFields.valueNumber': num } });
        } else {
          filter.push({ term: { 'customFields.valueKeyword': rawValues[0] } });
        }
      } else {
        filter.push({
          terms: { 'customFields.valueKeyword': rawValues },
        });
      }
    }

    return {
      nested: {
        path: 'customFields',
        query: { bool: { filter } },
      },
    };
  }

  private resolveValue(value: FilterValue, context: QueryContext): string | null {
    if (value.raw.toLowerCase() === 'me') return context.currentUserId;
    if (
      value.raw.toLowerCase() === '{no value}' ||
      value.raw.toLowerCase() === '{unassigned}'
    ) {
      return null;
    }
    return value.raw;
  }

  private resolveDate(expr: string): string {
    if (expr.toLowerCase() === 'today') return 'now/d';

    const relMatch = expr.match(/^([+-])(\d+)([dwmy])$/);
    if (relMatch) {
      const [, sign, amount, unit] = relMatch;
      const unitMap: Record<string, string> = {
        d: 'd',
        w: 'w',
        m: 'M',
        y: 'y',
      };
      return `now${sign}${amount}${unitMap[unit] ?? unit}/${unitMap[unit] ?? unit}`;
    }

    return expr;
  }

  private buildSort(sortNode: SortNode | null): object[] {
    if (!sortNode || sortNode.fields.length === 0) {
      return [
        { _score: { order: 'desc' } },
        { updatedAt: { order: 'desc' } },
        { id: { order: 'desc' } },
      ];
    }

    const sorts = sortNode.fields.map(({ field, direction }) => ({
      [FIELD_MAP[field.toLowerCase()] || field]: { order: direction },
    }));
    // Always add id tiebreaker for deterministic search_after pagination
    sorts.push({ id: { order: 'desc' } });
    return sorts;
  }
}
