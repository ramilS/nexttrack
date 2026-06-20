import { apiClient } from './client';
import type { CursorPaginatedResponse } from '@repo/shared';
import type {
  Comment,
  CreateCommentInput,
  UpdateCommentInput,
} from '@repo/shared/schemas';

export type { Comment, CreateCommentInput, UpdateCommentInput };

export const commentsApi = {
  list: (issueId: string, params?: { cursor?: string; pageSize?: number }) =>
    apiClient.get<CursorPaginatedResponse<Comment>>(`/issues/${issueId}/comments`, {
      params,
    }),

  create: (issueId: string, data: CreateCommentInput) =>
    apiClient.post<Comment>(`/issues/${issueId}/comments`, data),

  update: (issueId: string, commentId: string, data: UpdateCommentInput) =>
    apiClient.patch<Comment>(`/issues/${issueId}/comments/${commentId}`, data),

  delete: (issueId: string, commentId: string) =>
    apiClient.delete(`/issues/${issueId}/comments/${commentId}`),
};
