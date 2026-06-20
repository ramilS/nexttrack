import { apiClient } from './client';
import type { Tag, CreateTagInput, UpdateTagInput } from '@repo/shared/schemas';

export type { Tag, CreateTagInput, UpdateTagInput };

export const tagsApi = {
  list: (projectKey: string) =>
    apiClient.get<Tag[]>(`/projects/${projectKey}/tags`),

  create: (projectKey: string, data: CreateTagInput) =>
    apiClient.post<Tag>(`/projects/${projectKey}/tags`, data),

  update: (projectKey: string, tagId: string, data: UpdateTagInput) =>
    apiClient.patch<Tag>(`/projects/${projectKey}/tags/${tagId}`, data),

  delete: (projectKey: string, tagId: string) =>
    apiClient.delete(`/projects/${projectKey}/tags/${tagId}`),

  addToIssue: (issueId: string, tagId: string) =>
    apiClient.post(`/issues/${issueId}/tags`, { tagId }),

  removeFromIssue: (issueId: string, tagId: string) =>
    apiClient.delete(`/issues/${issueId}/tags/${tagId}`),
};
