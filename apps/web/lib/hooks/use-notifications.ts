'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  notificationsApi,
  type NotificationListParams,
  type UpdatePreferencesRequest,
} from '@/lib/api/notifications.api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: NotificationListParams) => [...notificationKeys.all, 'list', params] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,
  preferences: ['notifications', 'preferences'] as const,
  channelOptions: ['notifications', 'channelOptions'] as const,
};

export function useNotifications(
  params?: Omit<NotificationListParams, 'cursor'>,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(params),
    queryFn: async ({ pageParam }) => {
      const { data } = await notificationsApi.list({
        ...params,
        cursor: pageParam ?? undefined,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: options?.enabled,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => {
      const { data } = await notificationsApi.unreadCount();
      return data.count;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (notificationIds: string[]) => notificationsApi.markAsRead(notificationIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.setQueryData(notificationKeys.unreadCount, 0);
      toast.success('All notifications marked as read');
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: async () => {
      const { data } = await notificationsApi.getPreferences();
      return data;
    },
  });
}

export function useChannelOptions() {
  return useQuery({
    queryKey: notificationKeys.channelOptions,
    queryFn: async () => {
      const { data } = await notificationsApi.channelOptions();
      return data;
    },
    staleTime: Infinity,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePreferencesRequest) => notificationsApi.updatePreferences(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.preferences });
      toast.success('Preferences saved');
    },

  });
}
