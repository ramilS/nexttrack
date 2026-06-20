'use client';

import { useQuery } from '@tanstack/react-query';
import { chartsApi } from '@/lib/api/charts.api';
import type { CfdParams, VelocityParams } from '@/lib/api/charts.api';

export const chartKeys = {
  all: ['charts'] as const,
  cfd: (projectKey: string, boardId: string, params?: CfdParams) =>
    [...chartKeys.all, 'cfd', projectKey, boardId, params] as const,
  velocity: (projectKey: string, boardId: string, params?: VelocityParams) =>
    [...chartKeys.all, 'velocity', projectKey, boardId, params] as const,
};

export function useCfd(projectKey: string, boardId: string, params?: CfdParams) {
  return useQuery({
    queryKey: chartKeys.cfd(projectKey, boardId, params),
    queryFn: () => chartsApi.cfd(projectKey, boardId, params).then((r) => r.data),
    enabled: !!projectKey && !!boardId,
  });
}

export function useVelocity(projectKey: string, boardId: string, params?: VelocityParams) {
  return useQuery({
    queryKey: chartKeys.velocity(projectKey, boardId, params),
    queryFn: () => chartsApi.velocity(projectKey, boardId, params).then((r) => r.data),
    enabled: !!projectKey && !!boardId,
  });
}
