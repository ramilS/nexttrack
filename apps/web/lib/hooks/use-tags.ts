'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '@/lib/api/tags.api';
import type { CreateTagInput } from '@/lib/api/tags.api';
import { useMutationWithToast } from './use-mutation-with-toast';
import { issueKeys } from './use-issues';

export const tagKeys = {
  all: ['tags'] as const,
  list: (projectKey: string) => [...tagKeys.all, 'list', projectKey] as const,
};

export function useTags(projectKey: string) {
  return useQuery({
    queryKey: tagKeys.list(projectKey),
    queryFn: () => tagsApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useCreateTag(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateTagInput) => tagsApi.create(projectKey, data),
    successMessage: 'Tag created',
    errorMessage: 'Failed to create tag',
    invalidateKeys: [tagKeys.list(projectKey)],
  });
}

export function useUpdateTag(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ tagId, data }: { tagId: string; data: Partial<CreateTagInput> }) =>
      tagsApi.update(projectKey, tagId, data),
    errorMessage: 'Failed to update tag',
    invalidateKeys: [tagKeys.list(projectKey)],
  });
}

export function useDeleteTag(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (tagId: string) => tagsApi.delete(projectKey, tagId),
    successMessage: 'Tag deleted',
    errorMessage: 'Failed to delete tag',
    invalidateKeys: [tagKeys.list(projectKey)],
  });
}

export function useAddTagToIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, tagId }: { issueId: string; tagId: string }) =>
      tagsApi.addToIssue(issueId, tagId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}

export function useRemoveTagFromIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, tagId }: { issueId: string; tagId: string }) =>
      tagsApi.removeFromIssue(issueId, tagId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}
