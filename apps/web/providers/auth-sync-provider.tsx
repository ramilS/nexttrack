'use client';

import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { subscribeAuthEvent } from '@/lib/auth/auth-broadcast';

export function AuthSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeAuthEvent((event) => {
      if (event === 'logged-out') {
        useAuthStore.getState().logout();
        queryClient.clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
      if (event === 'logged-in') {
        void queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
    });
  }, [queryClient]);

  return <>{children}</>;
}
