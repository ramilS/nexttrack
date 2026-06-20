import { apiClient } from './client';
import type {
  UpdatePreferencesInput,
  NotificationPreferences,
  NotificationItem,
  UnreadCount,
  NotificationChannelOption,
} from '@repo/shared/schemas';
import type { CursorPaginatedResponse } from '@repo/shared';

export type { NotificationPreferences };

export type NotificationDto = NotificationItem;

export interface NotificationListParams {
  cursor?: string;
  pageSize?: number;
  isRead?: boolean;
  type?: string;
  projectId?: string;
}

export type NotificationTypeMeta = NotificationChannelOption;

// Request contract comes from the shared schema (single source of truth with
// the API), re-exported under this module's existing name.
export type UpdatePreferencesRequest = UpdatePreferencesInput;

export const notificationsApi = {
  list: (params?: NotificationListParams) =>
    apiClient.get<CursorPaginatedResponse<NotificationItem>>('/notifications', {
      params,
    }),

  unreadCount: () =>
    apiClient.get<UnreadCount>('/notifications/unread-count'),

  markAsRead: (notificationIds: string[]) =>
    apiClient.patch('/notifications/read', { notificationIds }),

  markAllAsRead: () =>
    apiClient.patch('/notifications/read-all'),

  delete: (id: string) =>
    apiClient.delete(`/notifications/${id}`),

  channelOptions: () =>
    apiClient.get<NotificationChannelOption[]>('/notifications/channel-options'),

  getPreferences: () =>
    apiClient.get<NotificationPreferences>('/notifications/preferences'),

  updatePreferences: (data: UpdatePreferencesRequest) =>
    apiClient.patch<NotificationPreferences>('/notifications/preferences', data),
};
