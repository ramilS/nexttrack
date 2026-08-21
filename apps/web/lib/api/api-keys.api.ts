import { apiClient } from './client';
import type { ApiKey, CreateApiKeyInput, IssuedApiKey } from '@repo/shared/schemas';

export const apiKeysApi = {
  list: (projectKey: string) => apiClient.get<ApiKey[]>(`/projects/${projectKey}/api-keys`),

  create: (projectKey: string, data: CreateApiKeyInput) =>
    apiClient.post<IssuedApiKey>(`/projects/${projectKey}/api-keys`, data),

  revoke: (projectKey: string, keyId: string) =>
    apiClient.delete(`/projects/${projectKey}/api-keys/${keyId}`),
};
