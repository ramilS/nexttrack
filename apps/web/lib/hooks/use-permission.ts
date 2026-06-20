'use client';

import { useProjectContext } from '@/lib/contexts/project.context';
import { Permission } from '@repo/shared';

export function useHasPermission(permission: Permission): boolean {
  const project = useProjectContext();
  return project.myRole?.permissions.includes(permission) ?? false;
}

export function useHasAnyPermission(permissions: Permission[]): boolean {
  const project = useProjectContext();
  const userPermissions = project.myRole?.permissions ?? [];
  return permissions.some((p) => userPermissions.includes(p));
}
