'use client';

import { useProjectContext } from '@/lib/contexts/project.context';
import { useAuthStore } from '@/lib/stores/auth.store';
import { isAdminRole } from '@/lib/auth/roles';
import { Permission } from '@repo/shared';

// Mirrors PermissionGuard's `if (req.user.role === GlobalRole.ADMIN) return true`
// (apps/api/src/common/guards/permission.guard.ts) — a global admin passes every
// project-permission check server-side even without project membership. Without
// this bypass, admins who aren't explicit project members (myRole === null) see
// every gated action hidden in the UI although the API would accept it.
function useIsGlobalAdmin(): boolean {
  return isAdminRole(useAuthStore((s) => s.user?.role));
}

export function useHasPermission(permission: Permission): boolean {
  const project = useProjectContext();
  const isGlobalAdmin = useIsGlobalAdmin();
  return isGlobalAdmin || (project.myRole?.permissions.includes(permission) ?? false);
}

export function useHasAnyPermission(permissions: Permission[]): boolean {
  const project = useProjectContext();
  const isGlobalAdmin = useIsGlobalAdmin();
  if (isGlobalAdmin) return true;
  const userPermissions = project.myRole?.permissions ?? [];
  return permissions.some((p) => userPermissions.includes(p));
}
