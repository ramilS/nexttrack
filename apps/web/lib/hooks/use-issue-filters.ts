'use client';

import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs';

export function useIssueFilters() {
  return useQueryStates({
    status: parseAsString,
    priority: parseAsString,
    assignee: parseAsString,
    type: parseAsString,
    sortBy: parseAsString.withDefault('updatedAt'),
    sortOrder: parseAsString.withDefault('desc'),
    page: parseAsInteger.withDefault(1),
    search: parseAsString,
  });
}
