'use client';

import { useQueryStates, parseAsString } from 'nuqs';
import { useCallback } from 'react';
import {
  parseQueryToFilters,
  buildQueryFromFilters,
  type SearchFilters,
} from '@/components/filters/filter-sync';

const searchParsers = {
  q: parseAsString.withDefault(''),
  status: parseAsString,
  priority: parseAsString,
  assignee: parseAsString,
  type: parseAsString,
  tag: parseAsString,
  sortBy: parseAsString.withDefault('updatedAt'),
  sortOrder: parseAsString.withDefault('desc'),
};

export function useSearchState() {
  const [state, setState] = useQueryStates(searchParsers);

  const setQuery = useCallback(
    (query: string) => {
      const filters = parseQueryToFilters(query);
      setState(filters);
    },
    [setState],
  );

  const setFilter = useCallback(
    (key: keyof SearchFilters, value: string | number | null) => {
      setState({ [key]: value } as Partial<typeof state>);
    },
    [setState],
  );

  const clearFilters = useCallback(() => {
    setState({
      q: '',
      status: null,
      priority: null,
      assignee: null,
      type: null,
      tag: null,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  }, [setState]);

  // Build full query string from current filters
  const fullQuery = buildQueryFromFilters(state);

  return {
    ...state,
    fullQuery,
    setQuery,
    setFilter,
    clearFilters,
    setFilters: setState,
  };
}
