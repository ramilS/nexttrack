import { z } from 'zod';
import { passwordSchema, globalRoleSchema } from './user.schema';
import { publicSsoProviderSchema } from './sso.schema';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Not the full policy: an existing account's password only needs to be
  // present (≥8) — complexity is enforced when the password is *created*.
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({
  token: z.guid(),
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// ─── Response schemas ─────────────────────────────────────────

/**
 * The authenticated-user payload returned by login / accept-invite. Tokens are
 * delivered as httpOnly cookies, never in the body — this is the entire JSON
 * response. Matches the web client's CurrentUser.
 */
export const authUserSchema = z.object({
  id: z.guid(),
  name: z.string(),
  email: z.string(),
  role: globalRoleSchema,
  avatarUrl: z.string().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authMethodsResponseSchema = z.object({
  local: z.object({ enabled: z.boolean() }),
  sso: z.array(publicSsoProviderSchema),
});
export type AuthMethodsResponse = z.infer<typeof authMethodsResponseSchema>;

/**
 * Why an invite token failed validation, so the accept page can show a precise
 * message (and, for `used`, point the visitor at login since the account exists).
 */
export const inviteInvalidReasonSchema = z.enum([
  'used',
  'expired',
  'revoked',
  'invalid',
]);
export type InviteInvalidReason = z.infer<typeof inviteInvalidReasonSchema>;

/**
 * Invite-token validation. Always 200; `email`/`inviterName` are present only
 * when `valid` is true, and `reason` only when it is false.
 */
export const inviteValidationSchema = z.object({
  valid: z.boolean(),
  email: z.string().optional(),
  inviterName: z.string().optional(),
  reason: inviteInvalidReasonSchema.optional(),
});
export type InviteValidation = z.infer<typeof inviteValidationSchema>;
