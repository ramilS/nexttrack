'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreateApiKeyInput } from '@repo/shared/schemas';
import { apiKeysApi } from '@/lib/api/api-keys.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const apiKeyKeys = {
  all: ['api-keys'] as const,
  list: (projectKey: string) => [...apiKeyKeys.all, 'list', projectKey] as const,
};

export function useApiKeys(projectKey: string) {
  return useQuery({
    queryKey: apiKeyKeys.list(projectKey),
    queryFn: () => apiKeysApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

/**
 * `gcTime: 0` on this mutation only: its `data` carries the raw secret, shown
 * exactly once. Without it the TanStack `MutationCache` keeps the last
 * successful mutation (secret included) for the default 5-minute `gcTime`
 * even after `reset()` detaches the observer — reachable via
 * `queryClient.getMutationCache()` and visible in React Query Devtools. With
 * `gcTime: 0`, `reset()` (called by `ApiKeysCard` when the reveal dialog is
 * dismissed) lets the cache drop the mutation on the next tick.
 */
export function useCreateApiKey(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateApiKeyInput) => apiKeysApi.create(projectKey, data).then((r) => r.data),
    successMessage: 'API key created',
    errorMessage: 'Failed to create API key',
    invalidateKeys: [apiKeyKeys.list(projectKey)],
    gcTime: 0,
  });
}

export function useRevokeApiKey(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (keyId: string) => apiKeysApi.revoke(projectKey, keyId),
    successMessage: 'API key revoked',
    errorMessage: 'Failed to revoke API key',
    invalidateKeys: [apiKeyKeys.list(projectKey)],
  });
}
