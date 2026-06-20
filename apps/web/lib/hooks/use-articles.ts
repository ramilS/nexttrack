'use client';

import { useQuery } from '@tanstack/react-query';
import { articlesApi } from '@/lib/api/articles.api';
import type {
  CreateArticleInput,
  UpdateArticleInput,
  MoveArticleInput,
} from '@/lib/api/articles.api';
import type { JSONContent } from '@tiptap/react';
import { useMutationWithToast } from './use-mutation-with-toast';

export const articleKeys = {
  all: ['articles'] as const,
  tree: (projectKey: string) => [...articleKeys.all, 'tree', projectKey] as const,
  detail: (projectKey: string, slug: string) => [...articleKeys.all, 'detail', projectKey, slug] as const,
  comments: (projectKey: string, articleId: string) => [...articleKeys.all, 'comments', projectKey, articleId] as const,
  search: (projectKey: string, q: string) => [...articleKeys.all, 'search', projectKey, q] as const,
};

export function useArticleTree(projectKey: string) {
  return useQuery({
    queryKey: articleKeys.tree(projectKey),
    queryFn: () => articlesApi.tree(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useArticle(projectKey: string, slug: string) {
  return useQuery({
    queryKey: articleKeys.detail(projectKey, slug),
    queryFn: () => articlesApi.get(projectKey, slug).then((r) => r.data),
    enabled: !!projectKey && !!slug,
  });
}

export function useCreateArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateArticleInput) => articlesApi.create(projectKey, data),
    successMessage: 'Article created',
    errorMessage: 'Failed to create article',
    invalidateKeys: [articleKeys.tree(projectKey)],
  });
}

export function useUpdateArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: UpdateArticleInput }) =>
      articlesApi.update(projectKey, id, data),
    errorMessage: 'Failed to update article',
    invalidateKeys: [articleKeys.all],
  });
}

export function useDeleteArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (id: string) => articlesApi.delete(projectKey, id),
    successMessage: 'Article deleted',
    errorMessage: 'Failed to delete article',
    invalidateKeys: [articleKeys.tree(projectKey)],
  });
}

export function useMoveArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: MoveArticleInput }) =>
      articlesApi.move(projectKey, id, data),
    errorMessage: 'Failed to move article',
    invalidateKeys: [articleKeys.tree(projectKey)],
  });
}

export function usePublishArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (id: string) => articlesApi.publish(projectKey, id),
    successMessage: 'Article published',
    errorMessage: 'Failed to publish article',
    invalidateKeys: [articleKeys.all],
  });
}

export function useArchiveArticle(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (id: string) => articlesApi.archive(projectKey, id),
    successMessage: 'Article archived',
    errorMessage: 'Failed to archive article',
    invalidateKeys: [articleKeys.all],
  });
}

export function useArticleComments(projectKey: string, articleId: string) {
  return useQuery({
    queryKey: articleKeys.comments(projectKey, articleId),
    queryFn: () => articlesApi.listComments(projectKey, articleId).then((r) => r.data),
    enabled: !!projectKey && !!articleId,
  });
}

export function useCreateArticleComment(projectKey: string, articleId: string) {
  return useMutationWithToast({
    mutationFn: (data: { body: JSONContent }) =>
      articlesApi.addComment(projectKey, articleId, data),
    errorMessage: 'Failed to add comment',
    invalidateKeys: [articleKeys.comments(projectKey, articleId)],
  });
}
