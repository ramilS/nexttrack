'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth.api';
import { bumpTokenVersion } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { publishAuthEvent } from '@/lib/auth/auth-broadcast';

export function useAuthMethods() {
  return useQuery({
    queryKey: ['authMethods'],
    queryFn: async () => {
      const { data } = await authApi.getAuthMethods();
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data } = await authApi.me();
      setUser(data);
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!/^\/(?!\/)/.test(raw)) return '/dashboard';
  if (raw.startsWith('/login')) return '/dashboard';
  return raw;
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ data }) => {
      bumpTokenVersion();
      setUser(data.user);
      queryClient.setQueryData(['currentUser'], data.user);
      publishAuthEvent('logged-in');
      const raw = new URLSearchParams(window.location.search).get('redirect');
      window.location.href = safeRedirectTarget(raw);
    },
    // Errors are surfaced inline on the login form via mutation.error.
    onError: () => {},
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout();
      } catch (err) {
        console.warn('[auth] logout request failed; clearing local state anyway', err);
      }
      logout();
      queryClient.clear();
      publishAuthEvent('logged-out');
      window.location.href = '/login';
    },
  });
}

export function useAcceptInvite() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.acceptInvite,
    onSuccess: ({ data }) => {
      bumpTokenVersion();
      setUser(data.user);
      queryClient.setQueryData(['currentUser'], data.user);
      publishAuthEvent('logged-in');
      window.location.href = '/dashboard';
    },
  });
}
