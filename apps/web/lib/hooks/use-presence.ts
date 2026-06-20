'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSocket } from '@/providers/socket-provider';

export function usePresence(userIds: string[]) {
  const socket = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const stableKey = [...userIds].sort().join(',');

  useEffect(() => {
    if (!socket || !stableKey) return;

    socket.emit('presence:check', { userIds: stableKey.split(',') });

    socket.on('presence:status', (data: { onlineUsers: string[] }) => {
      setOnlineUserIds(data.onlineUsers);
    });

    return () => {
      socket.off('presence:status');
    };
  }, [socket, stableKey]);

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  return {
    onlineUserIds,
    isOnline: (userId: string) => onlineSet.has(userId),
  };
}

export function useIssuePresence(issueId: string) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !issueId) return;

    socket.emit('join:issue', { issueId });

    return () => {
      socket.emit('leave:issue', { issueId });
    };
  }, [socket, issueId]);
}
