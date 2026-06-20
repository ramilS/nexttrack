'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { boardsApi } from '@/lib/api/boards.api';
import type { CreateBoardInput, MoveIssueInput, BoardColumn, SwimlaneBy } from '@/lib/api/boards.api';
import { toast } from 'sonner';
import { useMutationWithToast } from './use-mutation-with-toast';

export const boardKeys = {
  all: ['boards'] as const,
  list: (projectKey: string) => [...boardKeys.all, 'list', projectKey] as const,
  detail: (projectKey: string, boardId: string) => [...boardKeys.all, 'detail', projectKey, boardId] as const,
  dataPrefix: (projectKey: string, boardId: string) =>
    [...boardKeys.all, 'data', projectKey, boardId] as const,
  data: (projectKey: string, boardId: string, params?: Record<string, unknown>) =>
    [...boardKeys.all, 'data', projectKey, boardId, params] as const,
};

export function useBoards(projectKey: string) {
  return useQuery({
    queryKey: boardKeys.list(projectKey),
    queryFn: () => boardsApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useBoard(projectKey: string, boardId: string) {
  return useQuery({
    queryKey: boardKeys.detail(projectKey, boardId),
    queryFn: () => boardsApi.get(projectKey, boardId).then((r) => r.data),
    enabled: !!projectKey && !!boardId,
  });
}

export function useBoardData(
  projectKey: string,
  boardId: string,
  params?: { sprintId?: string; swimlaneBy?: SwimlaneBy; assigneeId?: string; search?: string },
) {
  return useQuery({
    queryKey: boardKeys.data(projectKey, boardId, params as Record<string, unknown>),
    queryFn: () => boardsApi.getData(projectKey, boardId, params).then((r) => r.data),
    enabled: !!projectKey && !!boardId,
    refetchInterval: 30_000,
  });
}

export function useCreateBoard(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateBoardInput) => boardsApi.create(projectKey, data),
    successMessage: 'Board created',
    errorMessage: 'Failed to create board',
    invalidateKeys: [boardKeys.list(projectKey)],
  });
}

export function useUpdateBoard(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: Partial<{ name: string; swimlaneBy: SwimlaneBy; filterQuery: string | null; autoCloseOnDone: boolean }>;
    }) => boardsApi.update(projectKey, boardId, data),
    errorMessage: 'Failed to update board',
    invalidateKeys: [boardKeys.all],
  });
}

export function useUpdateBoardColumns(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ boardId, columns }: { boardId: string; columns: BoardColumn[] }) =>
      boardsApi.updateColumns(projectKey, boardId, columns),
    successMessage: 'Columns updated',
    errorMessage: 'Failed to update columns',
    invalidateKeys: [boardKeys.all],
  });
}

export function useDeleteBoard(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (boardId: string) => boardsApi.delete(projectKey, boardId),
    successMessage: 'Board deleted',
    errorMessage: 'Failed to delete board',
    invalidateKeys: [boardKeys.list(projectKey)],
  });
}

export function useMoveIssue(projectKey: string, boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MoveIssueInput) => boardsApi.moveIssue(projectKey, boardId, data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: boardKeys.dataPrefix(projectKey, boardId) });

      const snapshots: [readonly unknown[], unknown][] = [];
      queryClient.getQueriesData({ queryKey: boardKeys.dataPrefix(projectKey, boardId) }).forEach(
        ([key, value]) => {
          if (value) snapshots.push([key as readonly unknown[], value]);
        },
      );

      queryClient.setQueriesData(
        { queryKey: boardKeys.dataPrefix(projectKey, boardId) },
        (old: unknown) => {
          if (!old) return old;
          const board = old as import('@/lib/api/boards.api').BoardDataResponse;

          let movedIssue: import('@/lib/api/boards.api').BoardIssueCard | undefined;

          const removeFromColumns = (columns: import('@/lib/api/boards.api').BoardColumnData[]) =>
            columns.map((col) => {
              const issue = col.issues.find((i) => i.id === data.issueId);
              if (issue && !movedIssue) {
                movedIssue = {
                  ...issue,
                  statusId: data.toStatusId ?? issue.statusId,
                  parentId: data.toParentId !== undefined ? data.toParentId ?? null : issue.parentId,
                };
              }
              return {
                ...col,
                issues: col.issues.filter((i) => i.id !== data.issueId),
                totalCount: issue ? col.totalCount - 1 : col.totalCount,
              };
            });

          const addToColumns = (columns: import('@/lib/api/boards.api').BoardColumnData[]) =>
            columns.map((col) => {
              const isTarget = data.toStatusId && col.column.statusIds.includes(data.toStatusId);
              if (!isTarget || !movedIssue) return col;
              return {
                ...col,
                issues: [...col.issues, movedIssue],
                totalCount: col.totalCount + 1,
              };
            });

          const cleanedColumns = removeFromColumns(board.columns);
          const cleanedSwimlanes = board.swimlanes.map((lane) => ({
            ...lane,
            columns: removeFromColumns(lane.columns),
          }));

          if (!movedIssue) return board;

          const targetSwimlaneKey = data.toParentId !== undefined
            ? (data.toParentId ? `epic:${data.toParentId}` : 'epic:none')
            : null;

          return {
            ...board,
            columns: targetSwimlaneKey ? cleanedColumns : addToColumns(cleanedColumns),
            swimlanes: cleanedSwimlanes.map((lane) => ({
              ...lane,
              columns: targetSwimlaneKey
                ? (lane.groupKey === targetSwimlaneKey ? addToColumns(lane.columns) : lane.columns)
                : addToColumns(lane.columns),
            })),
          };
        },
      );

      return { snapshots };
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const [key, value] of context.snapshots) {
          queryClient.setQueryData(key, value);
        }
      }
      toast.error('Failed to move issue');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: boardKeys.dataPrefix(projectKey, boardId) });
    },
  });
}
