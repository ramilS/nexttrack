import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthSyncProvider } from './auth-sync-provider';

// Capture the handler AuthSyncProvider registers with the broadcast channel so
// we can simulate an event from another tab without a real BroadcastChannel.
const { logoutMock, handlerRef } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  handlerRef: { current: null as ((e: string) => void) | null },
}));

vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
}));
vi.mock('@/lib/auth/auth-broadcast', () => ({
  subscribeAuthEvent: (handler: (e: string) => void) => {
    handlerRef.current = handler;
    return () => {};
  },
}));

function renderProvider() {
  const queryClient = new QueryClient();
  const clear = vi.spyOn(queryClient, 'clear');
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthSyncProvider>
        <div />
      </AuthSyncProvider>
    </QueryClientProvider>,
  );
  return { clear, invalidate };
}

describe('AuthSyncProvider (multi-tab auth sync)', () => {
  let originalLocation: Location;

  beforeEach(() => {
    handlerRef.current = null;
    vi.clearAllMocks();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', pathname: '/dashboard' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('clears auth store and query cache and redirects on a logged-out event from another tab', () => {
    const { clear } = renderProvider();

    handlerRef.current!('logged-out');

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/login');
  });

  it('does not redirect when already on /login', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', pathname: '/login' },
    });
    renderProvider();

    handlerRef.current!('logged-out');

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('');
  });

  it('invalidates the current-user query (not a logout) on a logged-in event', () => {
    const { invalidate, clear } = renderProvider();

    handlerRef.current!('logged-in');

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['currentUser'] });
    expect(logoutMock).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
