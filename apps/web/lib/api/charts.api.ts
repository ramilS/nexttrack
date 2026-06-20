import type { CfdResponse, VelocityResponse } from '@repo/shared/schemas';
import { apiClient } from './client';

export interface CfdParams {
  from?: string;
  to?: string;
  interval?: 'day' | 'week';
}

export interface VelocityParams {
  limit?: number;
}

export const chartsApi = {
  cfd: (projectKey: string, boardId: string, params?: CfdParams) =>
    apiClient.get<CfdResponse>(`/projects/${projectKey}/boards/${boardId}/cfd`, { params }),

  velocity: (projectKey: string, boardId: string, params?: VelocityParams) =>
    apiClient.get<VelocityResponse>(`/projects/${projectKey}/boards/${boardId}/velocity`, { params }),
};
