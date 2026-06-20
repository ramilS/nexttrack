import { SetMetadata } from '@nestjs/common';
import { Permission } from '@repo/shared';

export const PERMISSION_KEY = 'requiredPermissions';
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
