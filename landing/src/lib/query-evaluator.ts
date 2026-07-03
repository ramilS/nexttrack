import type {
  FieldFilterNode,
  FilterValue,
  ParsedQuery,
  QueryNode,
  SortNode,
} from '@repo/shared/query-language';
import { CURRENT_USER, type MockIssue } from './mock-issues';

const PRIORITY_RANK: Record<MockIssue['priority'], number> = {
  Urgent: 3,
  High: 2,
  Medium: 1,
  Low: 0,
};

function fieldValues(issue: MockIssue, field: string): string[] {
  switch (field.toLowerCase()) {
    case 'status':
    case 'state':
      return [issue.status];
    case 'priority':
      return [issue.priority];
    case 'type':
      return [issue.type];
    case 'assignee':
      return issue.assignee ? [issue.assignee] : [];
    case 'tag':
    case 'tags':
      return issue.tags;
    default:
      return [];
  }
}

function matchesValue(actual: string, value: FilterValue): boolean {
  const raw = value.isKeyword && value.raw.toLowerCase() === 'me' ? CURRENT_USER : value.raw;
  return actual.toLowerCase() === raw.toLowerCase();
}

function matchesFieldFilter(issue: MockIssue, node: FieldFilterNode): boolean {
  const actuals = fieldValues(issue, node.field);
  let result: boolean;
  switch (node.operator) {
    case 'IS_EMPTY':
      result = actuals.length === 0;
      break;
    case 'IS_NOT_EMPTY':
      result = actuals.length > 0;
      break;
    case 'RANGE':
      // Date/number ranges are out of scope for the demo dataset — pass-through.
      result = true;
      break;
    default:
      result = node.values.some((v) => actuals.some((a) => matchesValue(a, v)));
  }
  return node.negated ? !result : result;
}

function matchesNode(issue: MockIssue, node: QueryNode): boolean {
  switch (node.kind) {
    case 'FIELD_FILTER':
      return matchesFieldFilter(issue, node);
    case 'TEXT_SEARCH':
      return issue.title.toLowerCase().includes(node.text.toLowerCase());
    case 'HASHTAG':
      return node.name.toLowerCase() === 'unresolved'
        ? issue.status !== 'Done'
        : issue.tags.some((t) => t.toLowerCase() === node.name.toLowerCase());
  }
}

function comparableValue(issue: MockIssue, field: string): number | null {
  switch (field.toLowerCase()) {
    case 'created':
      return -issue.createdDaysAgo;
    case 'updated':
      return -issue.updatedDaysAgo;
    case 'priority':
      return PRIORITY_RANK[issue.priority];
    default:
      return null;
  }
}

function sortIssues(issues: MockIssue[], sort: SortNode): MockIssue[] {
  return [...issues].sort((a, b) => {
    for (const { field, direction } of sort.fields) {
      const av = comparableValue(a, field);
      const bv = comparableValue(b, field);
      if (av === null || bv === null || av === bv) continue;
      const diff = av < bv ? -1 : 1;
      return direction === 'asc' ? diff : -diff;
    }
    return 0;
  });
}

export function applyQuery(issues: MockIssue[], query: ParsedQuery): MockIssue[] {
  const filtered = issues.filter((issue) =>
    query.filters.every((node) => matchesNode(issue, node)),
  );
  return query.sort ? sortIssues(filtered, query.sort) : filtered;
}
