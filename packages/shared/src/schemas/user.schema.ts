import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/pagination';

export const USER_NAME_MAX = 100;
export const USER_BLOCK_REASON_MAX = 500;
export const USER_PASSWORD_MIN = 8;
export const USER_PASSWORD_MAX = 128;

export const GLOBAL_ROLES = ['USER', 'ADMIN'] as const;
export const globalRoleSchema = z.enum(GLOBAL_ROLES);
export type GlobalRole = z.infer<typeof globalRoleSchema>;

export const INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export const inviteStatusSchema = z.enum(INVITE_STATUSES);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const USER_STATUSES = ['active', 'blocked', 'deleted'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * Password policy: at least 8 chars, at most 128, must contain a lowercase
 * letter, an uppercase letter, and a digit.
 */
export const passwordSchema = z
  .string()
  .min(USER_PASSWORD_MIN)
  .max(USER_PASSWORD_MAX)
  .regex(
    /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
  );

// ─── Request schemas ─────────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(USER_NAME_MAX).optional(),
  avatarUrl: z.url().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const adminUpdateUserSchema = updateUserSchema;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sendInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type SendInviteInput = z.infer<typeof sendInviteSchema>;

export const blockUserSchema = z.object({
  reason: z.string().max(USER_BLOCK_REASON_MAX).optional(),
});
export type BlockUserInput = z.infer<typeof blockUserSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().optional(),
  status: userStatusSchema.optional(),
});
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;
export type ListUsersQueryParsed = z.infer<typeof listUsersQuerySchema>;

export const listInvitesQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired']).optional(),
});
export type ListInvitesQuery = z.infer<typeof listInvitesQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

/**
 * Full user as returned by the admin endpoints `/users` and `/users/:id`.
 * Includes moderation columns (isBlocked/blockReason/deletedAt) that admins
 * manage. Excludes internal columns (passwordHash, ytId, migratedFrom,
 * blockedById, deletedById). The current user's own profile (`/users/me`) uses
 * the narrower `currentUserSchema` below — it must NOT leak blockReason etc.
 */
export const userSchema = z.object({
  id: z.guid(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: globalRoleSchema,
  isBlocked: z.boolean(),
  blockedAt: z.iso.datetime().nullable(),
  blockReason: z.string().nullable(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

/**
 * The current user's own profile — GET/PATCH `/users/me`. Limited to the fields
 * the client actually uses; deliberately excludes the admin-only moderation
 * columns (isBlocked, blockedAt, blockReason, deletedAt) and timestamps so the
 * self endpoint never ships an admin's internal block reason back to the user.
 */
export const currentUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const inviteSummarySchema = z.object({
  id: z.guid(),
  name: z.string(),
});

export const inviteSchema = z.object({
  id: z.guid(),
  email: z.string(),
  role: globalRoleSchema,
  status: inviteStatusSchema,
  invitedBy: inviteSummarySchema.nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

export const userMembershipSchema = z.object({
  project: z.object({
    id: z.guid(),
    key: z.string(),
    name: z.string(),
    color: z.string(),
  }),
  role: z.object({
    id: z.guid(),
    name: z.string(),
    permissions: z.array(z.string()),
  }),
  joinedAt: z.iso.datetime(),
});
export type UserMembership = z.infer<typeof userMembershipSchema>;
