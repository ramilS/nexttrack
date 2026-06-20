'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '@/providers/socket-provider';

export function useTypingIndicator(issueId: string) {
  const socket = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!socket) return;

    socket.on('typing:update', (data: { userId: string; issueId: string; isTyping: boolean }) => {
      if (data.issueId !== issueId) return;
      setTypingUsers((prev) => {
        if (data.isTyping) {
          return [...new Set([...prev, data.userId])];
        }
        return prev.filter((id) => id !== data.userId);
      });
    });

    return () => {
      socket.off('typing:update');
    };
  }, [socket, issueId]);

  const startTyping = useCallback(() => {
    if (!socket) return;
    socket.emit('typing:start', { issueId });

    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { issueId });
    }, 5000);
  }, [socket, issueId]);

  const stopTyping = useCallback(() => {
    if (!socket) return;
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    socket.emit('typing:stop', { issueId });
  }, [socket, issueId]);

  return { typingUsers, startTyping, stopTyping };
}
