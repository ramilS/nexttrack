import { apiClient } from './client';
import type {
  Dashboard,
  DashboardWidget,
  WidgetLayoutItem,
  WidgetType,
  CreateDashboardInput,
  UpdateDashboardInput,
  AddWidgetInput,
  UpdateWidgetInput,
} from '@repo/shared/schemas';

export type {
  Dashboard,
  DashboardWidget,
  WidgetLayoutItem,
  WidgetType,
  CreateDashboardInput,
  UpdateDashboardInput,
  AddWidgetInput,
  UpdateWidgetInput,
};

/** Alias for legacy import sites. */
export type WidgetLayout = WidgetLayoutItem;

export const dashboardsApi = {
  list: () => apiClient.get<Dashboard[]>('/dashboards'),

  get: (id: string) => apiClient.get<Dashboard>(`/dashboards/${id}`),

  create: (data: CreateDashboardInput) =>
    apiClient.post<Dashboard>('/dashboards', data),

  update: (id: string, data: UpdateDashboardInput) =>
    apiClient.patch<Dashboard>(`/dashboards/${id}`, data),

  delete: (id: string) => apiClient.delete(`/dashboards/${id}`),

  addWidget: (dashboardId: string, data: AddWidgetInput) =>
    apiClient.post<DashboardWidget>(`/dashboards/${dashboardId}/widgets`, data),

  updateWidget: (dashboardId: string, widgetId: string, data: UpdateWidgetInput) =>
    apiClient.patch<DashboardWidget>(
      `/dashboards/${dashboardId}/widgets/${widgetId}`,
      data,
    ),

  removeWidget: (dashboardId: string, widgetId: string) =>
    apiClient.delete(`/dashboards/${dashboardId}/widgets/${widgetId}`),

  getWidgetData: <T = unknown>(dashboardId: string, widgetId: string) =>
    apiClient.get<T>(`/dashboards/${dashboardId}/widgets/${widgetId}/data`),

  getAllWidgetData: (dashboardId: string) =>
    apiClient.get<Record<string, unknown>>(
      `/dashboards/${dashboardId}/widgets-data`,
    ),
};
