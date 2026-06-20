import { GlobalRole } from '@repo/shared';

export function isAdminRole(role: `${GlobalRole}` | null | undefined): boolean {
  return role === GlobalRole.ADMIN;
}
