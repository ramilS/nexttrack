import { create } from 'zustand';
import type { CurrentUser } from '@repo/shared/schemas';

// The current user's self-view from GET/PATCH /users/me, owned by @repo/shared
// (`currentUserSchema`) — the API projects to exactly these fields, so the wire
// response and this type are one bound contract.
export type { CurrentUser };

interface AuthState {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  setUser: (user: CurrentUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
