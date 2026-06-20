'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreateWebhookInput, UpdateWebhookInput } from '@repo/shared/schemas';
import { webhooksApi } from '@/lib/api/webhooks.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const webhookKeys = {
  all: ['webhooks'] as const,
  list: (projectKey: string) => [...webhookKeys.all, 'list', projectKey] as const,
};

export function useWebhooks(projectKey: string) {
  return useQuery({
    queryKey: webhookKeys.list(projectKey),
    queryFn: () => webhooksApi.list(projectKey).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useCreateWebhook(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateWebhookInput) => webhooksApi.create(projectKey, data),
    successMessage: 'Webhook created',
    errorMessage: 'Failed to create webhook',
    invalidateKeys: [webhookKeys.list(projectKey)],
  });
}

export function useUpdateWebhook(projectKey: string) {
  return useMutationWithToast({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: UpdateWebhookInput }) =>
      webhooksApi.update(projectKey, webhookId, data),
    successMessage: 'Webhook updated',
    errorMessage: 'Failed to update webhook',
    invalidateKeys: [webhookKeys.list(projectKey)],
  });
}

export function useDeleteWebhook(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (webhookId: string) => webhooksApi.delete(projectKey, webhookId),
    successMessage: 'Webhook deleted',
    errorMessage: 'Failed to delete webhook',
    invalidateKeys: [webhookKeys.list(projectKey)],
  });
}

export function useTestWebhook(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (webhookId: string) => webhooksApi.test(projectKey, webhookId),
    successMessage: 'Test webhook sent',
    errorMessage: 'Failed to send test webhook',
  });
}
