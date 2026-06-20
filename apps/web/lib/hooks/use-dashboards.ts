'use client';

import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi } from '@/lib/api/dashboards.api';
import type {
  CreateDashboardInput,
  UpdateDashboardInput,
  AddWidgetInput,
  UpdateWidgetInput,
} from '@/lib/api/dashboards.api';
import { useMutationWithToast } from './use-mutation-with-toast';

export const dashboardKeys = {
  all: ['dashboards'] as const,
  list: () => [...dashboardKeys.all, 'list'] as const,
  detail: (id: string) => [...dashboardKeys.all, 'detail', id] as const,
  widgetData: (dashboardId: string, widgetId: string) =>
    [...dashboardKeys.all, 'widget-data', dashboardId, widgetId] as const,
};

export function useDashboards() {
  return useQuery({
    queryKey: dashboardKeys.list(),
    queryFn: () => dashboardsApi.list().then((r) => r.data),
  });
}

export function useDashboard(id: string) {
  return useQuery({
    queryKey: dashboardKeys.detail(id),
    queryFn: () => dashboardsApi.get(id).then((r) => r.data),
    enabled: !!id,
  });
}

export interface WidgetBatchContextValue {
  data: Record<string, unknown> | undefined;
  isLoading: boolean;
}

export const WidgetBatchContext = createContext<WidgetBatchContextValue>({
  data: undefined,
  isLoading: false,
});

export function useWidgetData<T = unknown>(dashboardId: string, widgetId: string) {
  const batch = useContext(WidgetBatchContext);
  const hasBatchData = batch.data !== undefined;

  const individualQuery = useQuery({
    queryKey: dashboardKeys.widgetData(dashboardId, widgetId),
    queryFn: () => dashboardsApi.getWidgetData<T>(dashboardId, widgetId).then((r) => r.data),
    enabled: !!dashboardId && !!widgetId && !hasBatchData,
    staleTime: 30_000,
  });

  if (hasBatchData) {
    return {
      data: (batch.data?.[widgetId] ?? undefined) as T | undefined,
      isLoading: batch.isLoading,
      isError: false,
      error: null,
    };
  }

  return individualQuery;
}

export function useCreateDashboard() {
  return useMutationWithToast({
    mutationFn: (data: CreateDashboardInput) => dashboardsApi.create(data),
    successMessage: 'Dashboard created',
    errorMessage: 'Failed to create dashboard',
    invalidateKeys: [dashboardKeys.all],
  });
}

export function useUpdateDashboard() {
  return useMutationWithToast({
    mutationFn: ({ id, data }: { id: string; data: UpdateDashboardInput }) =>
      dashboardsApi.update(id, data),
    errorMessage: 'Failed to update dashboard',
    invalidateKeys: [dashboardKeys.all],
  });
}

export function useDeleteDashboard() {
  return useMutationWithToast({
    mutationFn: (id: string) => dashboardsApi.delete(id),
    successMessage: 'Dashboard deleted',
    errorMessage: 'Failed to delete dashboard',
    invalidateKeys: [dashboardKeys.all],
  });
}

export function useAddWidget(dashboardId: string) {
  return useMutationWithToast({
    mutationFn: (data: AddWidgetInput) => dashboardsApi.addWidget(dashboardId, data),
    successMessage: 'Widget added',
    errorMessage: 'Failed to add widget',
    invalidateKeys: [dashboardKeys.all],
  });
}

export function useUpdateWidget(dashboardId: string) {
  return useMutationWithToast({
    mutationFn: ({ widgetId, data }: { widgetId: string; data: UpdateWidgetInput }) =>
      dashboardsApi.updateWidget(dashboardId, widgetId, data),
    errorMessage: 'Failed to update widget',
    invalidateKeys: [dashboardKeys.all],
  });
}

export function useRemoveWidget(dashboardId: string) {
  return useMutationWithToast({
    mutationFn: (widgetId: string) => dashboardsApi.removeWidget(dashboardId, widgetId),
    successMessage: 'Widget removed',
    errorMessage: 'Failed to remove widget',
    invalidateKeys: [dashboardKeys.all],
  });
}
