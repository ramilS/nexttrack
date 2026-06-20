'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/stores/auth.store';

const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

function resolveSocketUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3001';
  return null;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const url = resolveSocketUrl();
    if (!url) {
      console.warn('[ws] NEXT_PUBLIC_WS_URL not configured; skipping connection');
      return;
    }

    let active = true;

    void import('socket.io-client').then(({ io }) => {
      if (!active) return;

      const s = io(url, {
        path: '/realtime',
        withCredentials: true,
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      if (process.env.NODE_ENV === 'development') {
        s.on('connect', () => console.log('[ws] connected'));
        s.on('disconnect', (reason) => console.log('[ws] disconnected:', reason));
      }

      s.on('connect_error', (err) => {
        console.error('[ws] connection error:', err.message);
      });

      socketRef.current = s;
      setSocket(s);
    });

    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const onTokenRefreshed = () => {
      const s = socketRef.current;
      if (!s) return;
      s.disconnect();
      s.connect();
    };
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);
    return () => window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
