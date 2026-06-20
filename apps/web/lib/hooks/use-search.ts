'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { searchApi } from '@/lib/api/search.api';
import type { SearchQuery, SearchResponse, AutocompleteQuery } from '@/lib/api/search.api';
import type { IssueDetail, SearchResultItem } from '@repo/shared/schemas';

export const searchKeys = {
  all: ['search'] as const,
  results: (params: Omit<SearchQuery, 'cursor'>) => [...searchKeys.all, 'results', params] as const,
  autocomplete: (params: AutocompleteQuery) =>
    [...searchKeys.all, 'autocomplete', params] as const,
  validate: (q: string) => [...searchKeys.all, 'validate', q] as const,
};

interface SearchInfiniteData {
  pages: SearchResponse[];
  pageParams: unknown[];
}

/** A results-list query key carries its `SearchQuery` params at index 2. */
function resultsParams(
  queryKey: readonly unknown[],
): Pick<SearchQuery, 'q' | 'projectId'> | null {
  if (queryKey[1] !== 'results') return null;
  return (queryKey[2] ?? null) as Pick<SearchQuery, 'q' | 'projectId'> | null;
}

/**
 * The issue list is Elasticsearch-backed and the index lags issue creation by
 * up to one outbox-poll interval. To give the author read-your-writes feedback
 * we map the create response into a search hit and prepend it to this project's
 * *unfiltered* lists — without refetching them, since an immediate refetch would
 * drop the issue back out until the index catches up. Filtered lists of the same
 * project are invalidated instead (the issue may not match their query).
 */
function toSearchResultItem(issue: IssueDetail): SearchResultItem | null {
  if (!issue.status) return null;
  return {
    issue: {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      status: issue.status,
      assignee: issue.assignee,
      reporter: issue.reporter,
      tags: issue.tags.map((tag) => ({
        ...tag,
        projectId: issue.project.id,
        createdAt: issue.createdAt,
      })),
      dueDate: issue.dueDate,
      sprintName: issue.sprintName,
      project: issue.project,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
    highlights: {},
    score: null,
  };
}

export function applyCreatedIssueToSearchCache(
  queryClient: QueryClient,
  issue: IssueDetail,
): void {
  const item = toSearchResultItem(issue);
  if (!item) {
    queryClient.invalidateQueries({ queryKey: searchKeys.all });
    return;
  }

  queryClient.setQueriesData<SearchInfiniteData>(
    {
      queryKey: searchKeys.all,
      predicate: (query) => {
        const params = resultsParams(query.queryKey);
        return !!params && params.projectId === issue.project.id && !params.q;
      },
    },
    (old) => {
      if (!old || old.pages.length === 0) return old;
      const [first, ...rest] = old.pages;
      if (!first) return old;
      if (first.items.some((i) => i.issue.id === issue.id)) return old;
      return {
        ...old,
        pages: [
          {
            ...first,
            items: [item, ...first.items],
            meta: { ...first.meta, total: first.meta.total + 1 },
          },
          ...rest,
        ],
      };
    },
  );

  queryClient.invalidateQueries({
    queryKey: searchKeys.all,
    predicate: (query) => {
      const params = resultsParams(query.queryKey);
      return !!params && params.projectId === issue.project.id && !!params.q;
    },
  });
}

export function useSearch(params: Omit<SearchQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: searchKeys.results(params),
    queryFn: async ({ pageParam }): Promise<SearchResponse> => {
      const { data } = await searchApi.search({
        ...params,
        cursor: pageParam ?? undefined,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!params.q || !!params.projectId,
  });
}

export function useAutocomplete(params: AutocompleteQuery, enabled = true) {
  return useQuery({
    queryKey: searchKeys.autocomplete(params),
    queryFn: () => searchApi.autocomplete(params).then((r) => r.data),
    enabled: enabled && !!params.q,
    staleTime: 30_000,
  });
}

export function useValidateQuery(q: string) {
  return useQuery({
    queryKey: searchKeys.validate(q),
    queryFn: () => searchApi.validate(q).then((r) => r.data),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
}
