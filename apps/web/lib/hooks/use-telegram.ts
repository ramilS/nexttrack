'use client';

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { telegramApi } from '@/lib/api/telegram.api';
import type { CreateTelegramConfigRequest, UpdateTelegramConfigRequest } from '@/lib/api/telegram.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const telegramKeys = {
  all: ['telegram'] as const,
  config: (projectKey: string) => [...telegramKeys.all, 'config', projectKey] as const,
};

export function useTelegramConfig(projectKey: string) {
  return useQuery({
    queryKey: telegramKeys.config(projectKey),
    queryFn: () => telegramApi.get(projectKey).then((r) => r.data),
    enabled: !!projectKey,
    retry: (failureCount, error: unknown) => {
      if (error instanceof AxiosError && error.response?.status === 404) return false;
      return failureCount < 3;
    },
  });
}

export function useCreateTelegramConfig(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: CreateTelegramConfigRequest) => telegramApi.create(projectKey, data),
    successMessage: 'Telegram integration created',
    errorMessage: 'Failed to create Telegram integration',
    invalidateKeys: [telegramKeys.config(projectKey)],
  });
}

export function useUpdateTelegramConfig(projectKey: string) {
  return useMutationWithToast({
    mutationFn: (data: UpdateTelegramConfigRequest) => telegramApi.update(projectKey, data),
    successMessage: 'Telegram integration updated',
    errorMessage: 'Failed to update Telegram integration',
    invalidateKeys: [telegramKeys.config(projectKey)],
  });
}

export function useDeleteTelegramConfig(projectKey: string) {
  return useMutationWithToast({
    mutationFn: () => telegramApi.delete(projectKey),
    successMessage: 'Telegram integration removed',
    errorMessage: 'Failed to remove Telegram integration',
    invalidateKeys: [telegramKeys.config(projectKey)],
  });
}

export function useTestTelegram(projectKey: string) {
  return useMutationWithToast({
    mutationFn: () => telegramApi.test(projectKey),
    successMessage: 'Test message sent',
    errorMessage: 'Failed to send test message',
  });
}
