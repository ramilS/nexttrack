import { isAdminRole } from '@/lib/auth/roles';
import { useAuthStore } from '@/lib/stores/auth.store';

export function useIsAdmin(): boolean {
  return useAuthStore((s) => isAdminRole(s.user?.role));
}
