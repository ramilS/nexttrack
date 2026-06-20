import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import type { CurrentUser } from './auth.store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it('starts with no user and not authenticated', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setUser sets user and marks authenticated', () => {
    const user: CurrentUser = { id: '1', email: 'a@b.com', name: 'Alice', avatarUrl: null, role: 'ADMIN' };
    useAuthStore.getState().setUser(user);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it('setUser(null) clears authentication', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'a@b.com', name: 'Alice', avatarUrl: null, role: 'ADMIN' });
    useAuthStore.getState().setUser(null);

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('logout clears state', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'a@b.com', name: 'Alice', avatarUrl: null, role: 'ADMIN' });

    useAuthStore.getState().logout();

    // httpOnly cookies are cleared server-side; store only manages client state
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
