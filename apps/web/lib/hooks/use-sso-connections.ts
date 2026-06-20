'use client';

import { useQuery } from '@tanstack/react-query';
import { ssoConnectionsApi } from '@/lib/api/sso-admin.api';
import { useMutationWithToast } from './use-mutation-with-toast';

const connectionKeys = {
  all: ['sso-connections'] as const,
};

export function useSsoConnections() {
  return useQuery({
    queryKey: connectionKeys.all,
    queryFn: async () => {
      const { data } = await ssoConnectionsApi.list();
      return data;
    },
  });
}

export function useDisconnectSso() {
  return useMutationWithToast({
    mutationFn: (providerId: string) => ssoConnectionsApi.disconnect(providerId),
    successMessage: 'Account disconnected',
    errorMessage: 'Failed to disconnect account',
    invalidateKeys: [connectionKeys.all],
  });
}
