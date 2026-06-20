'use client';

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsApi } from '@/lib/api/boards.api';
import type {
  SprintStatus,
  CreateSprintInput,
  UpdateSprintInput,
  StartSprintInput,
  CloseSprintInput,
} from '@/lib/api/boards.api';
import { boardKeys } from './use-boards';
import { useMutationWithToast } from './use-mutation-with-toast';

export const sprintKeys = {
  all: ['sprints'] as const,
  list: (boardId: string, status?: SprintStatus) => [...sprintKeys.all, 'list', boardId, status] as const,
  detail: (boardId: string, sprintId: string) => [...sprintKeys.all, 'detail', boardId, sprintId] as const,
  backlog: (boardId: string, search?: string) => [...sprintKeys.all, 'backlog', boardId, search] as const,
  burndown: (boardId: string, sprintId: string) => [...sprintKeys.all, 'burndown', boardId, sprintId] as const,
};

export function useSprints(boardId: string, status?: SprintStatus) {
  return useQuery({
    queryKey: sprintKeys.list(boardId, status),
    queryFn: () => sprintsApi.list(boardId, status).then((r) => r.data.items),
    enabled: !!boardId,
  });
}

export function useBacklogIssues(
  boardId: string,
  params?: { search?: string; enabled?: boolean },
) {
  const enabled = params?.enabled ?? true;
  return useInfiniteQuery({
    queryKey: [...sprintKeys.all, 'backlog-issues', boardId, params?.search] as const,
    queryFn: async ({ pageParam }) => {
      const { data } = await sprintsApi.getBacklogIssues(boardId, {
        search: params?.search,
        cursor: pageParam ?? undefined,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!boardId && enabled,
  });
}

export function useSprintBacklog(
  boardId: string,
  params?: { search?: string; enabled?: boolean },
) {
  const enabled = params?.enabled ?? true;
  return useQuery({
    queryKey: sprintKeys.backlog(boardId, params?.search),
    queryFn: () =>
      sprintsApi
        .getBacklog(boardId, { search: params?.search })
        .then((r) => r.data),
    enabled: !!boardId && enabled,
  });
}

export function useSprintBurndown(boardId: string, sprintId: string) {
  return useQuery({
    queryKey: sprintKeys.burndown(boardId, sprintId),
    queryFn: () => sprintsApi.getBurndown(boardId, sprintId).then((r) => r.data),
    enabled: !!boardId && !!sprintId,
  });
}

export function useCreateSprint(boardId: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateSprintInput) => sprintsApi.create(boardId, data),
    successMessage: 'Sprint created',
    errorMessage: 'Failed to create sprint',
    invalidateKeys: [sprintKeys.all],
  });
}

export function useUpdateSprint(boardId: string) {
  return useMutationWithToast({
    mutationFn: ({ sprintId, data }: { sprintId: string; data: UpdateSprintInput }) =>
      sprintsApi.update(boardId, sprintId, data),
    errorMessage: 'Failed to update sprint',
    invalidateKeys: [sprintKeys.all],
  });
}

export function useStartSprint(boardId: string) {
  return useMutationWithToast({
    mutationFn: ({ sprintId, data }: { sprintId: string; data?: StartSprintInput }) =>
      sprintsApi.start(boardId, sprintId, data),
    successMessage: 'Sprint started',
    errorMessage: 'Failed to start sprint',
    invalidateKeys: [sprintKeys.all],
  });
}

export function useCloseSprint(boardId: string) {
  return useMutationWithToast({
    mutationFn: ({ sprintId, data }: { sprintId: string; data: CloseSprintInput }) =>
      sprintsApi.close(boardId, sprintId, data),
    successMessage: (result) =>
      `Sprint closed — ${result.data.completedIssues} issues completed, velocity: ${result.data.velocityPoints} pts`,
    errorMessage: 'Failed to close sprint',
    invalidateKeys: [sprintKeys.all, boardKeys.all],
  });
}

export function useDeleteSprint(boardId: string) {
  return useMutationWithToast({
    mutationFn: (sprintId: string) => sprintsApi.delete(boardId, sprintId),
    successMessage: 'Sprint deleted',
    errorMessage: 'Failed to delete sprint',
    invalidateKeys: [sprintKeys.all],
  });
}

export function useAddIssuesToSprint(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sprintId, issueIds }: { sprintId: string; issueIds: string[] }) =>
      sprintsApi.addIssues(boardId, sprintId, issueIds),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all });
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}

export function useRemoveIssuesFromSprint(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sprintId, issueIds }: { sprintId: string; issueIds: string[] }) =>
      sprintsApi.removeIssues(boardId, sprintId, issueIds),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all });
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}
