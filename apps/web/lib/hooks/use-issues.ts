'use client';

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { issuesApi } from '@/lib/api/issues.api';
import type { IssueListParams } from '@/lib/api/issues.api';
import type { BulkUpdateIssuesInput, CreateIssueInput, UpdateIssueInput } from '@repo/shared/schemas';
import { applyCreatedIssueToSearchCache } from '@/lib/hooks/use-search';
import { issueViews } from './query-invalidation';
import { toast } from 'sonner';

export const issueKeys = {
  all: ['issues'] as const,
  list: (params: Record<string, unknown>) => [...issueKeys.all, 'list', params] as const,
  detail: (projectKey: string, number: number) =>
    [...issueKeys.all, 'detail', projectKey, number] as const,
  activities: (issueId: string) => [...issueKeys.all, 'activities', issueId] as const,
  children: (issueId: string) => [...issueKeys.all, 'children', issueId] as const,
};

export function useIssues(params: Omit<IssueListParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: issueKeys.list(params as unknown as Record<string, unknown>),
    queryFn: async ({ pageParam }) => {
      const { data } = await issuesApi.list({
        ...params,
        cursor: pageParam ?? undefined,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
  });
}

export function useIssue(projectKey: string, number: number) {
  return useQuery({
    queryKey: issueKeys.detail(projectKey, number),
    queryFn: () => issuesApi.getByNumber(projectKey, number).then((r) => r.data),
    enabled: !!projectKey && !!number,
  });
}

export function useCreateIssue(projectKey: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIssueInput) => issuesApi.create(projectKey, data),
    meta: { invalidates: issueViews() },
    onSuccess: (res) => {
      applyCreatedIssueToSearchCache(queryClient, res.data);
      toast.success(`${projectKey}-${res.data.number} created`);
    },
    onError: () => {
      toast.error('Failed to create issue');
    },
  });
}

export interface UpdateIssueMutationParams {
  projectKey: string;
  issueNumber: number;
  issueId: string;
  data: UpdateIssueInput;
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectKey, issueNumber, data }: UpdateIssueMutationParams) =>
      issuesApi.update(projectKey, issueNumber, data),

    meta: { invalidates: issueViews() },

    onMutate: async ({ issueId, data }) => {
      const listKey = [...issueKeys.all, 'list'] as const;
      const detailKey = [...issueKeys.all, 'detail'] as const;

      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: detailKey });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tagIds, ...scalarUpdates } = data as Record<string, unknown>;

      const listSnapshot = queryClient.getQueriesData({ queryKey: listKey });
      const detailSnapshot = queryClient.getQueriesData({ queryKey: detailKey });

      // Update infinite query data (pages array)
      queryClient.setQueriesData(
        { queryKey: listKey },
        (old: unknown) => {
          if (!old) return old;
          const record = old as { pages?: Array<{ items: Array<Record<string, unknown>>; meta: unknown }>; pageParams?: unknown[] };
          if (!record.pages) return old;
          return {
            ...record,
            pages: record.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === issueId ? { ...item, ...scalarUpdates } : item,
              ),
            })),
          };
        },
      );

      queryClient.setQueriesData(
        { queryKey: detailKey },
        (old: unknown) => {
          if (!old) return old;
          const record = old as Record<string, unknown>;
          if (record.id !== issueId) return old;
          return { ...record, ...scalarUpdates };
        },
      );

      return { listSnapshot, detailSnapshot };
    },

    onError: (_err, _vars, context) => {
      if (context?.listSnapshot) {
        for (const [key, value] of context.listSnapshot) {
          queryClient.setQueryData(key, value);
        }
      }
      if (context?.detailSnapshot) {
        for (const [key, value] of context.detailSnapshot) {
          queryClient.setQueryData(key, value);
        }
      }
      toast.error('Failed to update issue');
    },
  });
}

export function useDeleteIssue() {
  return useMutation({
    mutationFn: ({ projectKey, issueNumber }: { projectKey: string; issueNumber: number }) =>
      issuesApi.delete(projectKey, issueNumber),
    meta: { invalidates: issueViews() },
    onSuccess: () => {
      toast.success('Issue deleted');
    },
    onError: () => {
      toast.error('Failed to delete issue');
    },
  });
}

export function useBulkUpdateIssues() {
  return useMutation({
    mutationFn: ({ projectKey, ...data }: { projectKey: string } & BulkUpdateIssuesInput) =>
      issuesApi.bulkUpdate(projectKey, data),
    meta: { invalidates: issueViews() },
    onSuccess: (_res, vars) => {
      toast.success(`${vars.issueIds.length} issues updated`);
    },
    onError: () => {
      toast.error('Failed to update issues');
    },
  });
}

export function useIssueActivities(projectKey: string, issueNumber: number) {
  return useInfiniteQuery({
    queryKey: issueKeys.activities(`${projectKey}-${issueNumber}`),
    queryFn: async ({ pageParam }) => {
      const { data } = await issuesApi.getActivities(projectKey, issueNumber, {
        cursor: pageParam ?? undefined,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!projectKey && !!issueNumber,
  });
}

export function useIssueChildren(projectKey: string, issueNumber: number) {
  const key = `${projectKey}-${issueNumber}`;
  return useQuery({
    queryKey: issueKeys.children(key),
    queryFn: () => issuesApi.getChildren(projectKey, issueNumber).then((r) => r.data),
    enabled: !!projectKey && !!issueNumber,
  });
}

export function useToggleWatch() {
  return useMutation({
    mutationFn: ({ projectKey, issueNumber, isWatching }: { projectKey: string; issueNumber: number; isWatching: boolean }) =>
      isWatching ? issuesApi.unwatch(projectKey, issueNumber) : issuesApi.watch(projectKey, issueNumber),
    meta: { invalidates: [issueKeys.all] },
  });
}
