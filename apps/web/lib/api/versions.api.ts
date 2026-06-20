import { apiClient } from './client';
import type {
  Version,
  VersionStatus,
  CreateVersionInput,
  UpdateVersionInput,
  ReorderVersionsInput,
} from '@repo/shared/schemas';

export type { Version, VersionStatus, CreateVersionInput, UpdateVersionInput, ReorderVersionsInput };

export const versionsApi = {
  list: (projectKey: string, status?: VersionStatus) =>
    apiClient.get<Version[]>(`/projects/${projectKey}/versions`, {
      params: status ? { status } : undefined,
    }),

  create: (projectKey: string, data: CreateVersionInput) =>
    apiClient.post<Version>(`/projects/${projectKey}/versions`, data),

  update: (projectKey: string, versionId: string, data: UpdateVersionInput) =>
    apiClient.patch<Version>(`/projects/${projectKey}/versions/${versionId}`, data),

  release: (projectKey: string, versionId: string, releaseDate?: string) =>
    apiClient.patch<Version>(`/projects/${projectKey}/versions/${versionId}/release`, {
      releaseDate,
    }),

  archive: (projectKey: string, versionId: string) =>
    apiClient.patch<Version>(`/projects/${projectKey}/versions/${versionId}/archive`, {}),

  delete: (projectKey: string, versionId: string) =>
    apiClient.delete(`/projects/${projectKey}/versions/${versionId}`),

  reorder: (projectKey: string, ordinals: ReorderVersionsInput['ordinals']) =>
    apiClient.put<Version[]>(`/projects/${projectKey}/versions/reorder`, { ordinals }),
};
