'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ssoAdminApi,
  type CreateSsoProviderInput,
  type UpdateSsoProviderInput,
} from '@/lib/api/sso-admin.api';
import { useMutationWithToast } from './use-mutation-with-toast';

const ssoKeys = {
  all: ['sso-providers'] as const,
  list: () => [...ssoKeys.all, 'list'] as const,
  detail: (id: string) => [...ssoKeys.all, 'detail', id] as const,
  connections: (id: string) => [...ssoKeys.all, 'connections', id] as const,
};

export function useSsoProviders() {
  return useQuery({
    queryKey: ssoKeys.list(),
    queryFn: async () => {
      const { data } = await ssoAdminApi.list();
      return data;
    },
  });
}

export function useSsoProvider(id: string) {
  return useQuery({
    queryKey: ssoKeys.detail(id),
    queryFn: async () => {
      const { data } = await ssoAdminApi.get(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateSsoProvider() {
  return useMutationWithToast({
    mutationFn: (data: CreateSsoProviderInput) => ssoAdminApi.create(data),
    successMessage: 'SSO provider created',
    errorMessage: 'Failed to create SSO provider',
    invalidateKeys: [ssoKeys.all],
  });
}

export function useUpdateSsoProvider() {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: UpdateSsoProviderInput }) =>
      ssoAdminApi.update(id, data),
    successMessage: 'SSO provider updated',
    errorMessage: 'Failed to update SSO provider',
    invalidateKeys: [ssoKeys.all],
  });
}

export function useToggleSsoProvider() {
  return useMutationWithToast({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoAdminApi.enable(id) : ssoAdminApi.disable(id),
    successMessage: 'Provider status updated',
    errorMessage: 'Failed to update provider status',
    invalidateKeys: [ssoKeys.all],
  });
}

export function useDeleteSsoProvider() {
  return useMutationWithToast({
    mutationFn: (id: string) => ssoAdminApi.delete(id),
    successMessage: 'SSO provider deleted',
    errorMessage: 'Failed to delete SSO provider',
    invalidateKeys: [ssoKeys.all],
  });
}

export function useSsoProviderConnections(id: string) {
  return useQuery({
    queryKey: ssoKeys.connections(id),
    queryFn: async () => {
      const { data } = await ssoAdminApi.getConnections(id);
      return data;
    },
    enabled: !!id,
  });
}
