'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { toast } from 'sonner';
import { issueKeys } from './use-issues';
import { searchKeys } from './use-search';
import { boardKeys } from './use-boards';
import { commentKeys } from './use-comments';
import { sprintKeys } from './use-sprints';

interface CommentCreatedEvent {
  payload: { issueId: string };
  actorId: string;
}

interface SprintEvent {
  payload: { name: string };
  actorId: string;
}

export function useRealtimeUpdates(projectKey?: string) {
  const socket = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    if (projectKey) {
      socket.emit('join:project', { projectId: projectKey });
    }

    // Always invalidate via the exported key-factory roots: hand-written keys
    // silently miss TanStack's prefix match and the views never refetch.
    const invalidateIssueViews = () => {
      void qc.invalidateQueries({ queryKey: issueKeys.all });
      void qc.invalidateQueries({ queryKey: searchKeys.all });
      void qc.invalidateQueries({ queryKey: boardKeys.all });
    };

    socket.on('issue:created', () => {
      void qc.invalidateQueries({ queryKey: searchKeys.all });
      void qc.invalidateQueries({ queryKey: boardKeys.all });
    });

    socket.on('issue:updated', invalidateIssueViews);
    socket.on('issue:deleted', invalidateIssueViews);

    socket.on('comment:created', (event: CommentCreatedEvent) => {
      void qc.invalidateQueries({
        queryKey: commentKeys.list(event.payload.issueId),
      });
    });

    socket.on('board:issue-moved', () => {
      void qc.invalidateQueries({ queryKey: boardKeys.all });
    });

    socket.on('sprint:started', (event: SprintEvent) => {
      void qc.invalidateQueries({ queryKey: sprintKeys.all });
      toast.info(`Sprint "${event.payload.name}" started`);
    });

    socket.on('sprint:closed', (event: SprintEvent) => {
      void qc.invalidateQueries({ queryKey: sprintKeys.all });
      toast.info(`Sprint "${event.payload.name}" completed`);
    });

    return () => {
      if (projectKey) {
        socket.emit('leave:project', { projectId: projectKey });
      }
      socket.off('issue:created');
      socket.off('issue:updated');
      socket.off('issue:deleted');
      socket.off('comment:created');
      socket.off('board:issue-moved');
      socket.off('sprint:started');
      socket.off('sprint:closed');
    };
  }, [socket, projectKey, qc]);
}
