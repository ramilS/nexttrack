'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { toast } from 'sonner';
import { notificationKeys } from './use-notifications';
import type { NotificationDto } from '@/lib/api/notifications.api';

function getNotificationMessage(n: NotificationDto): { title: string; description?: string } {
  const p = n.payload as Record<string, string>;
  switch (n.type) {
    case 'ISSUE_ASSIGNED':
      return { title: `${p.actorName} assigned ${p.issueKey} to you`, description: p.issueTitle };
    case 'COMMENT_ADD':
      return { title: `${p.actorName} commented on ${p.issueKey}`, description: p.commentPreview };
    case 'STATUS_CHANGE':
      return { title: `${p.issueKey} status changed`, description: `${p.fromStatus} → ${p.toStatus}` };
    case 'MENTION':
      return { title: `${p.actorName} mentioned you in ${p.issueKey}` };
    case 'ISSUE_RESOLVED':
      return { title: `${p.issueKey} resolved`, description: p.issueTitle };
    case 'SPRINT_STARTED':
      return { title: `Sprint "${p.sprintName}" started` };
    case 'SPRINT_CLOSED':
      return { title: `Sprint "${p.sprintName}" completed` };
    case 'ADDED_TO_PROJECT':
      return { title: `You were added to project ${p.projectKey}` };
    case 'DUE_DATE':
      return { title: `${p.issueKey} is due soon`, description: p.issueTitle };
    default:
      return { title: 'New notification' };
  }
}

export function useRealtimeNotifications() {
  const socket = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    socket.on('notification:new', (notification: NotificationDto) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.setQueryData<number>(notificationKeys.unreadCount, (old) => (old ?? 0) + 1);

      const msg = getNotificationMessage(notification);
      toast(msg.title, {
        description: msg.description,
      });
    });

    return () => {
      socket.off('notification:new');
    };
  }, [socket, qc]);
}
