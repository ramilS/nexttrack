'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearch } from './use-search';
import type { SearchResultItem } from '@/lib/api/search.api';

export function useQuickSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      setDebouncedQuery('');
      return;
    }
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const { data, isLoading } = useSearch({
    q: debouncedQuery,
    pageSize: 5,
  });

  const results: SearchResultItem[] = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const meta = data?.pages[0]?.meta;

  return {
    query,
    setQuery,
    results,
    meta,
    isLoading: isLoading && !!debouncedQuery,
  };
}
