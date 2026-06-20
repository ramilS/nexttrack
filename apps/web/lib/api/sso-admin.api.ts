import { apiClient } from './client';
import type {
  SsoProvider,
  PublicSsoProvider,
  SsoProviderConnection,
  UserSsoConnection,
  CreateSsoProviderInput,
  UpdateSsoProviderInput,
  SsoProviderType,
  ProvisioningPolicy,
} from '@repo/shared/schemas';
import type { PaginatedResponse } from '@repo/shared';

export type {
  SsoProvider,
  PublicSsoProvider,
  SsoProviderConnection,
  UserSsoConnection,
  CreateSsoProviderInput,
  UpdateSsoProviderInput,
  SsoProviderType,
  ProvisioningPolicy,
};

export const ssoAdminApi = {
  list: () => apiClient.get<SsoProvider[]>('/admin/sso/providers'),

  get: (id: string) => apiClient.get<SsoProvider>(`/admin/sso/providers/${id}`),

  create: (data: CreateSsoProviderInput) =>
    apiClient.post<SsoProvider>('/admin/sso/providers', data),

  update: (id: string, data: UpdateSsoProviderInput) =>
    apiClient.patch<SsoProvider>(`/admin/sso/providers/${id}`, data),

  enable: (id: string) =>
    apiClient.post<SsoProvider>(`/admin/sso/providers/${id}/enable`),

  disable: (id: string) =>
    apiClient.post<SsoProvider>(`/admin/sso/providers/${id}/disable`),

  delete: (id: string) => apiClient.delete(`/admin/sso/providers/${id}`),

  getConnections: (id: string) =>
    apiClient.get<PaginatedResponse<SsoProviderConnection>>(
      `/admin/sso/providers/${id}/connections`,
    ),
};

export const ssoConnectionsApi = {
  list: () => apiClient.get<UserSsoConnection[]>('/auth/sso/connections'),

  disconnect: (providerId: string) =>
    apiClient.delete(`/auth/sso/${providerId}/disconnect`),
};
