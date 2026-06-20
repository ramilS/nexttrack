import { z } from 'zod';
import { ALL_PERMISSIONS, type Permission } from '../permissions';

export type { Permission };

export const ROLE_NAME_MAX = 100;
export const ROLE_DESCRIPTION_MAX = 500;

const permissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);

// ─── Request schemas ─────────────────────────────────────────

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(ROLE_NAME_MAX),
  description: z.string().max(ROLE_DESCRIPTION_MAX).optional(),
  permissions: z
    .array(permissionSchema)
    .min(1, 'At least one permission is required'),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(ROLE_NAME_MAX).optional(),
  description: z.string().max(ROLE_DESCRIPTION_MAX).optional(),
  permissions: z
    .array(permissionSchema)
    .min(1, 'At least one permission is required')
    .optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ─── Response schemas ─────────────────────────────────────────

export const roleSchema = z.object({
  id: z.guid(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(permissionSchema),
  isSystem: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Role = z.infer<typeof roleSchema>;
