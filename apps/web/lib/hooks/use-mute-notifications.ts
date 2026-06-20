'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notificationsApi } from '@/lib/api/notifications.api';
import type { NotificationPreferences } from '@/lib/api/notifications.api';
import { notificationKeys, useNotificationPreferences } from './use-notifications';

export function useMuteProject() {
  const queryClient = useQueryClient();
  const { data: prefs } = useNotificationPreferences();

  const isMuted = (projectId: string) =>
    prefs?.mutedProjectIds?.includes(projectId) ?? false;

  const toggleMute = useMutation({
    mutationFn: async (projectId: string) => {
      const current = prefs?.mutedProjectIds ?? [];
      const muted = current.includes(projectId);
      const mutedProjectIds = muted
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];

      return notificationsApi.updatePreferences({ mutedProjectIds });
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.preferences });
      const previous = queryClient.getQueryData<NotificationPreferences>(notificationKeys.preferences);

      if (previous) {
        const current = previous.mutedProjectIds ?? [];
        const muted = current.includes(projectId);
        queryClient.setQueryData<NotificationPreferences>(notificationKeys.preferences, {
          ...previous,
          mutedProjectIds: muted
            ? current.filter((id) => id !== projectId)
            : [...current, projectId],
        });
      }

      return { previous };
    },
    onError: (_err, _projectId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.preferences, context.previous);
      }
      toast.error('Failed to update mute settings');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences });
    },
  });

  return { isMuted, toggleMute };
}

export function useMuteIssue() {
  const queryClient = useQueryClient();
  const { data: prefs } = useNotificationPreferences();

  const isMuted = (issueId: string) =>
    prefs?.mutedIssueIds?.includes(issueId) ?? false;

  const toggleMute = useMutation({
    mutationFn: async (issueId: string) => {
      const current = prefs?.mutedIssueIds ?? [];
      const muted = current.includes(issueId);
      const mutedIssueIds = muted
        ? current.filter((id) => id !== issueId)
        : [...current, issueId];

      return notificationsApi.updatePreferences({ mutedIssueIds });
    },
    onMutate: async (issueId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.preferences });
      const previous = queryClient.getQueryData<NotificationPreferences>(notificationKeys.preferences);

      if (previous) {
        const current = previous.mutedIssueIds ?? [];
        const muted = current.includes(issueId);
        queryClient.setQueryData<NotificationPreferences>(notificationKeys.preferences, {
          ...previous,
          mutedIssueIds: muted
            ? current.filter((id) => id !== issueId)
            : [...current, issueId],
        });
      }

      return { previous };
    },
    onError: (_err, _issueId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.preferences, context.previous);
      }
      toast.error('Failed to update mute settings');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences });
    },
  });

  return { isMuted, toggleMute };
}
