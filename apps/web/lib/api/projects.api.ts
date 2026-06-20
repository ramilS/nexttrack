import { apiClient } from './client';
import type { PaginatedResponse } from '@repo/shared';
import type {
  Project,
  ProjectDetail,
  ProjectMember,
  WorkflowStatus,
  CreateProjectInput,
  UpdateProjectInput,
  AddMemberInput,
  UpdateMemberInput,
  ListProjectsQuery,
  UserSummary,
} from '@repo/shared/schemas';

export const projectsApi = {
  list: (params?: ListProjectsQuery) =>
    apiClient.get<PaginatedResponse<Project>>('/projects', { params }),

  getByKey: (key: string) =>
    apiClient.get<ProjectDetail>(`/projects/${key}`),

  create: (data: CreateProjectInput) =>
    apiClient.post<ProjectDetail>('/projects', data),

  update: (key: string, data: UpdateProjectInput) =>
    apiClient.patch<ProjectDetail>(`/projects/${key}`, data),

  archive: (key: string) =>
    apiClient.post<ProjectDetail>(`/projects/${key}/archive`),

  unarchive: (key: string) =>
    apiClient.post<ProjectDetail>(`/projects/${key}/unarchive`),

  restore: (key: string) =>
    apiClient.post<ProjectDetail>(`/projects/${key}/restore`),

  delete: (key: string) =>
    apiClient.delete(`/projects/${key}`),

  getMembers: (projectKey: string) =>
    apiClient.get<ProjectMember[]>(`/projects/${projectKey}/members`),

  addMember: (projectKey: string, data: AddMemberInput) =>
    apiClient.post<ProjectMember>(`/projects/${projectKey}/members`, data),

  searchAddableUsers: (projectKey: string, q: string) =>
    apiClient.get<UserSummary[]>(`/projects/${projectKey}/members/addable`, { params: { q } }),

  updateMember: (projectKey: string, userId: string, data: UpdateMemberInput) =>
    apiClient.patch<ProjectMember>(`/projects/${projectKey}/members/${userId}`, data),

  removeMember: (projectKey: string, userId: string) =>
    apiClient.delete(`/projects/${projectKey}/members/${userId}`),

  getWorkflowStatuses: (projectKey: string) =>
    apiClient.get<WorkflowStatus[]>(`/projects/${projectKey}/workflows/statuses`),
};
