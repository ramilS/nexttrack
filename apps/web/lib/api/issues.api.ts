import { apiClient } from './client';
import type {
  Activity,
  IssueListItem,
  IssueDetail,
  BulkUpdateResult,
  BulkUpdateIssuesInput,
  CreateIssueInput,
  UpdateIssueInput,
} from '@repo/shared/schemas';
import type { CursorPaginatedResponse } from '@repo/shared';

export interface IssueListParams {
  projectKey: string;
  cursor?: string;
  pageSize?: number;
  status?: string;
  priority?: string;
  assigneeId?: string;
  type?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export const issuesApi = {
  list: (params: IssueListParams) =>
    apiClient.get<CursorPaginatedResponse<IssueListItem>>(
      `/projects/${params.projectKey}/issues`,
      { params: { ...params, projectKey: undefined } },
    ),

  getByNumber: (projectKey: string, number: number) =>
    apiClient.get<IssueDetail>(`/projects/${projectKey}/issues/${number}`),

  create: (projectKey: string, data: CreateIssueInput) =>
    apiClient.post<IssueDetail>(`/projects/${projectKey}/issues`, data),

  update: (projectKey: string, issueNumber: number, data: UpdateIssueInput) =>
    apiClient.patch<IssueDetail>(`/projects/${projectKey}/issues/${issueNumber}`, data),

  delete: (projectKey: string, issueNumber: number) =>
    apiClient.delete(`/projects/${projectKey}/issues/${issueNumber}`),

  restore: (projectKey: string, issueNumber: number) =>
    apiClient.post<IssueDetail>(`/projects/${projectKey}/issues/${issueNumber}/restore`),

  getChildren: (projectKey: string, issueNumber: number) =>
    apiClient.get<IssueListItem[]>(`/projects/${projectKey}/issues/${issueNumber}/children`),

  getActivities: (projectKey: string, issueNumber: number, params?: { cursor?: string; pageSize?: number }) =>
    apiClient.get<CursorPaginatedResponse<Activity>>(
      `/projects/${projectKey}/issues/${issueNumber}/activities`,
      { params },
    ),

  watch: (projectKey: string, issueNumber: number) =>
    apiClient.post(`/projects/${projectKey}/issues/${issueNumber}/watchers`),

  unwatch: (projectKey: string, issueNumber: number) =>
    apiClient.delete(`/projects/${projectKey}/issues/${issueNumber}/watchers`),

  bulkUpdate: (projectKey: string, data: BulkUpdateIssuesInput) =>
    apiClient.patch<BulkUpdateResult>(`/projects/${projectKey}/issues/bulk`, data),
};
