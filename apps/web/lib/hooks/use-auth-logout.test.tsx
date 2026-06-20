import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Hoisted mock state: a deferred logout response lets us observe the gap between
// the API call and the redirect, proving the redirect waits for the request.
const { logoutApi, storeLogout, publish, deferred } = vi.hoisted(() => {
  const deferred: { resolve: () => void } = { resolve: () => {} };
  return {
    logoutApi: vi.fn(
      () =>
        new Promise((resolve) => {
          deferred.resolve = () => resolve({ data: undefined });
        }),
    ),
    storeLogout: vi.fn(),
    publish: vi.fn(),
    deferred,
  };
});

vi.mock('@/lib/api/auth.api', () => ({ authApi: { logout: logoutApi } }));
vi.mock('@/lib/api/client', () => ({ bumpTokenVersion: vi.fn() }));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { logout: () => void }) => unknown) =>
    selector({ logout: storeLogout }),
}));
vi.mock('@/lib/auth/auth-broadcast', () => ({ publishAuthEvent: publish }));

import { useLogout } from './use-auth';

function renderLogout() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const clear = vi.spyOn(queryClient, 'clear');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useLogout(), { wrapper });
  return { result, clear };
}

describe('useLogout', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('awaits the logout request before redirecting (does not abort the in-flight fetch)', async () => {
    const { result, clear } = renderLogout();

    act(() => {
      result.current.mutate();
    });

    // The API call is in flight but unresolved — nothing after the await may run yet.
    await waitFor(() => expect(logoutApi).toHaveBeenCalledTimes(1));
    expect(window.location.href).toBe('');
    expect(storeLogout).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();

    // Resolve the request → the redirect and local cleanup now run.
    act(() => deferred.resolve());

    await waitFor(() => expect(window.location.href).toBe('/login'));
    expect(storeLogout).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('logged-out');
  });
});
