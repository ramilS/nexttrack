/**
 * Bidirectional synchronization between query string, visual filters, and URL params.
 */

export interface SearchFilters {
  q: string;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  type: string | null;
  tag: string | null;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  q: '',
  status: null,
  priority: null,
  assignee: null,
  type: null,
  tag: null,
};

/**
 * Parse a query string into structured filters for the visual filter bar.
 *
 * Returns a COMPLETE filter set (absent fields reset to default, not omitted) so
 * that editing the box clears removed fields — a partial result would let nuqs's
 * merge keep a stale value and re-serialize it, duplicating text on delete.
 */
export function parseQueryToFilters(query: string): SearchFilters {
  const filters: SearchFilters = { ...DEFAULT_SEARCH_FILTERS };
  let remaining = query;

  // Value is a double-quoted run (may contain spaces) or an unquoted non-space run.
  // Sort is deliberately absent: the "sort by: <field> <dir>" clause stays in the
  // free text and is handled by the backend query-language, not extracted here.
  const fieldPattern = /(?:^|\s)(status|priority|assignee|type|tag):(?:"([^"]*)"|(\S+))/gi;
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(query)) !== null) {
    const field = match[1]!.toLowerCase();
    const value = match[2] ?? match[3]!;
    remaining = remaining.replace(match[0], '');

    switch (field) {
      case 'status':
        // A workflow-status name, not an enum — keep verbatim (don't upper-case).
        filters.status = value;
        break;
      case 'priority':
        filters.priority = value.toUpperCase();
        break;
      case 'assignee':
        filters.assignee = value;
        break;
      case 'type':
        filters.type = value.toUpperCase();
        break;
      case 'tag':
        filters.tag = value;
        break;
    }
  }

  // Handle hashtags
  if (remaining.includes('#MyIssues')) {
    filters.assignee = 'me';
    remaining = remaining.replace(/#MyIssues/g, '');
  }
  if (remaining.includes('#Unresolved')) {
    remaining = remaining.replace(/#Unresolved/g, '');
  }

  filters.q = remaining.trim();
  return filters;
}

/**
 * Build a query string from structured filters.
 */
export function buildQueryFromFilters(filters: Partial<SearchFilters>): string {
  const parts: string[] = [];

  if (filters.q?.trim()) {
    parts.push(filters.q.trim());
  }

  if (filters.status) {
    parts.push(`status:${quoteIfNeeded(filters.status)}`);
  }

  if (filters.priority) {
    parts.push(`priority:${filters.priority}`);
  }

  if (filters.assignee) {
    if (filters.assignee === 'me') {
      parts.push('assignee:{me}');
    } else {
      parts.push(`assignee:${quoteIfNeeded(filters.assignee)}`);
    }
  }

  if (filters.type) {
    parts.push(`type:${filters.type}`);
  }

  if (filters.tag) {
    parts.push(`tag:${quoteIfNeeded(filters.tag)}`);
  }

  return parts.join(' ');
}

/** Quote a value containing whitespace so the lexer reads it as one token. */
function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}
