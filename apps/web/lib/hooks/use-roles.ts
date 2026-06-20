'use client';

import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '@/lib/api/roles.api';
import type { CreateRoleInput, UpdateRoleInput } from '@/lib/api/roles.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const roleKeys = {
  all: ['roles'] as const,
  list: () => [...roleKeys.all, 'list'] as const,
  detail: (id: string) => [...roleKeys.all, 'detail', id] as const,
};

export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: () => rolesApi.list().then((r) => r.data),
  });
}

export function useCreateRole() {
  return useMutationWithToast({
    mutationFn: (data: CreateRoleInput) => rolesApi.create(data),
    successMessage: 'Role created',
    errorMessage: 'Failed to create role',
    invalidateKeys: [roleKeys.all],
  });
}

export function useUpdateRole() {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleInput }) =>
      rolesApi.update(id, data),
    successMessage: 'Role updated',
    errorMessage: 'Failed to update role',
    invalidateKeys: [roleKeys.all],
  });
}

export function useDeleteRole() {
  return useMutationWithToast({
    mutationFn: (id: string) => rolesApi.delete(id),
    successMessage: 'Role deleted',
    errorMessage: 'Failed to delete role',
    invalidateKeys: [roleKeys.all],
  });
}
