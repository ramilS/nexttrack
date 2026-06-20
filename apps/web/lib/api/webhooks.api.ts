import { apiClient } from './client';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookTestResult,
} from '@repo/shared/schemas';

export const webhooksApi = {
  list: (projectKey: string) =>
    apiClient.get<Webhook[]>(`/projects/${projectKey}/webhooks`),

  get: (projectKey: string, webhookId: string) =>
    apiClient.get<Webhook>(`/projects/${projectKey}/webhooks/${webhookId}`),

  create: (projectKey: string, data: CreateWebhookInput) =>
    apiClient.post<Webhook>(`/projects/${projectKey}/webhooks`, data),

  update: (projectKey: string, webhookId: string, data: UpdateWebhookInput) =>
    apiClient.patch<Webhook>(`/projects/${projectKey}/webhooks/${webhookId}`, data),

  delete: (projectKey: string, webhookId: string) =>
    apiClient.delete(`/projects/${projectKey}/webhooks/${webhookId}`),

  test: (projectKey: string, webhookId: string) =>
    apiClient.post<WebhookTestResult>(`/projects/${projectKey}/webhooks/${webhookId}/test`),
};
