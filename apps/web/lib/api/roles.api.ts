import { apiClient } from './client';
import type { Role, CreateRoleInput, UpdateRoleInput } from '@repo/shared/schemas';

export type { Role, CreateRoleInput, UpdateRoleInput };

export const rolesApi = {
  list: () => apiClient.get<Role[]>('/roles'),

  getById: (id: string) => apiClient.get<Role>(`/roles/${id}`),

  create: (data: CreateRoleInput) => apiClient.post<Role>('/roles', data),

  update: (id: string, data: UpdateRoleInput) =>
    apiClient.patch<Role>(`/roles/${id}`, data),

  delete: (id: string) => apiClient.delete(`/roles/${id}`),
};
