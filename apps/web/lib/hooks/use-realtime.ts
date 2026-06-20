'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { toast } from 'sonner';

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

    socket.on('issue:created', () => {
      // Invalidate list for this project only; refetch is scoped by queryKey
      qc.invalidateQueries({ queryKey: ['issues', 'list', projectKey] });
      qc.invalidateQueries({ queryKey: ['board', projectKey] });
    });

    socket.on('issue:updated', () => {
      // Invalidate detail views for this project + list
      qc.invalidateQueries({ queryKey: ['issues', 'detail', projectKey] });
      qc.invalidateQueries({ queryKey: ['issues', 'list', projectKey] });
    });

    socket.on('issue:deleted', () => {
      qc.invalidateQueries({ queryKey: ['issues', 'detail', projectKey] });
      qc.invalidateQueries({ queryKey: ['issues', 'list', projectKey] });
    });

    socket.on('comment:created', (event: CommentCreatedEvent) => {
      qc.invalidateQueries({ queryKey: ['comments', event.payload.issueId] });
    });

    socket.on('board:issue-moved', () => {
      qc.invalidateQueries({ queryKey: ['board', projectKey] });
    });

    socket.on('sprint:started', (event: SprintEvent) => {
      qc.invalidateQueries({ queryKey: ['sprints', projectKey] });
      toast.info(`Sprint "${event.payload.name}" started`);
    });

    socket.on('sprint:closed', (event: SprintEvent) => {
      qc.invalidateQueries({ queryKey: ['sprints', projectKey] });
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
