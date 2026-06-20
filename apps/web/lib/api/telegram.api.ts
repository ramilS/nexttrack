import { apiClient } from './client';
import type {
  TelegramConfig,
  TelegramTestResult,
  CreateTelegramConfigInput,
  UpdateTelegramConfigInput,
} from '@repo/shared/schemas';

// Contracts are owned by @repo/shared (single source of truth with the API),
// re-exported under this module's existing names so consumers don't change.
export type TelegramConfigDto = TelegramConfig;
export type CreateTelegramConfigRequest = CreateTelegramConfigInput;
export type UpdateTelegramConfigRequest = UpdateTelegramConfigInput;
export type { TelegramTestResult };

export const telegramApi = {
  get: (projectKey: string) =>
    apiClient.get<TelegramConfig>(`/projects/${projectKey}/telegram`),

  create: (projectKey: string, data: CreateTelegramConfigRequest) =>
    apiClient.post<TelegramConfig>(`/projects/${projectKey}/telegram`, data),

  update: (projectKey: string, data: UpdateTelegramConfigRequest) =>
    apiClient.patch<TelegramConfig>(`/projects/${projectKey}/telegram`, data),

  delete: (projectKey: string) =>
    apiClient.delete(`/projects/${projectKey}/telegram`),

  test: (projectKey: string) =>
    apiClient.post<TelegramTestResult>(`/projects/${projectKey}/telegram/test`),
};
