'use client';

import { useQuery } from '@tanstack/react-query';
import { commentsApi } from '@/lib/api/comments.api';
import type { CreateCommentInput, UpdateCommentInput } from '@/lib/api/comments.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const commentKeys = {
  all: ['comments'] as const,
  list: (issueId: string) => [...commentKeys.all, 'list', issueId] as const,
};

export function useComments(issueId: string) {
  return useQuery({
    queryKey: commentKeys.list(issueId),
    queryFn: () => commentsApi.list(issueId).then((r) => r.data.items),
    enabled: !!issueId,
  });
}

export function useCreateComment(issueId: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateCommentInput) => commentsApi.create(issueId, data),
    errorMessage: 'Failed to create comment',
    invalidateKeys: [commentKeys.list(issueId)],
  });
}

export function useUpdateComment(issueId: string) {
  return useMutationWithToast({
    mutationFn: ({ commentId, data }: { commentId: string; data: UpdateCommentInput }) =>
      commentsApi.update(issueId, commentId, data),
    errorMessage: 'Failed to update comment',
    invalidateKeys: [commentKeys.list(issueId)],
  });
}

export function useDeleteComment(issueId: string) {
  return useMutationWithToast({
    mutationFn: (commentId: string) => commentsApi.delete(issueId, commentId),
    successMessage: 'Comment deleted',
    errorMessage: 'Failed to delete comment',
    invalidateKeys: [commentKeys.list(issueId)],
  });
}
