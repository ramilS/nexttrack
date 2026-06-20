import { apiClient } from './client';
import type { CursorPaginatedResponse } from '@repo/shared';
import type {
  Article,
  ArticleComment,
  ArticleTreeNode,
  CreateArticleInput,
  UpdateArticleInput,
  MoveArticleInput,
  CreateArticleCommentInput,
  UpdateArticleCommentInput,
} from '@repo/shared/schemas';

export type {
  Article,
  ArticleComment,
  ArticleTreeNode,
  CreateArticleInput,
  UpdateArticleInput,
  MoveArticleInput,
  CreateArticleCommentInput,
  UpdateArticleCommentInput,
};

export const articlesApi = {
  tree: (projectKey: string) =>
    apiClient.get<ArticleTreeNode[]>(`/projects/${projectKey}/articles/tree`),

  get: (projectKey: string, slug: string) =>
    apiClient.get<Article>(`/projects/${projectKey}/articles/${slug}`),

  create: (projectKey: string, data: CreateArticleInput) =>
    apiClient.post<Article>(`/projects/${projectKey}/articles`, data),

  update: (projectKey: string, id: string, data: UpdateArticleInput) =>
    apiClient.patch<Article>(`/projects/${projectKey}/articles/${id}`, data),

  delete: (projectKey: string, id: string) =>
    apiClient.delete(`/projects/${projectKey}/articles/${id}`),

  move: (projectKey: string, id: string, data: MoveArticleInput) =>
    apiClient.post<Article>(`/projects/${projectKey}/articles/${id}/move`, data),

  publish: (projectKey: string, id: string) =>
    apiClient.post<Article>(`/projects/${projectKey}/articles/${id}/publish`, {}),

  archive: (projectKey: string, id: string) =>
    apiClient.post<Article>(`/projects/${projectKey}/articles/${id}/archive`, {}),

  listComments: (
    projectKey: string,
    articleId: string,
    params?: { cursor?: string; pageSize?: number },
  ) =>
    apiClient.get<CursorPaginatedResponse<ArticleComment>>(
      `/projects/${projectKey}/articles/${articleId}/comments`,
      { params },
    ),

  addComment: (
    projectKey: string,
    articleId: string,
    data: CreateArticleCommentInput,
  ) =>
    apiClient.post<ArticleComment>(
      `/projects/${projectKey}/articles/${articleId}/comments`,
      data,
    ),

  updateComment: (
    projectKey: string,
    articleId: string,
    commentId: string,
    data: UpdateArticleCommentInput,
  ) =>
    apiClient.patch<ArticleComment>(
      `/projects/${projectKey}/articles/${articleId}/comments/${commentId}`,
      data,
    ),

  deleteComment: (projectKey: string, articleId: string, commentId: string) =>
    apiClient.delete(
      `/projects/${projectKey}/articles/${articleId}/comments/${commentId}`,
    ),
};
