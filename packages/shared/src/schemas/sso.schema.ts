import { z } from 'zod';
import { globalRoleSchema } from './user.schema';

export const SSO_PROVIDER_NAME_MAX = 100;
export const SSO_FINALIZE_CODE_REGEX = /^[0-9a-f]{64}$/;

export const SSO_PROVIDER_TYPES = ['GOOGLE', 'MICROSOFT', 'OKTA', 'SAML'] as const;
export const ssoProviderTypeSchema = z.enum(SSO_PROVIDER_TYPES);
export type SsoProviderType = z.infer<typeof ssoProviderTypeSchema>;

export const PROVISIONING_POLICIES = ['INVITE_ONLY', 'AUTO_PROVISION'] as const;
export const provisioningPolicySchema = z.enum(PROVISIONING_POLICIES);
export type ProvisioningPolicy = z.infer<typeof provisioningPolicySchema>;

// ─── Request schemas ─────────────────────────────────────────

/**
 * SSO-provisioned accounts are always created as `USER`. Auto-promoting SSO
 * users to `ADMIN` is a privilege-escalation footgun — anyone who can
 * authenticate via the provider would inherit admin rights. Promote users
 * manually after provisioning.
 */
export const ssoDefaultRoleSchema = z.literal('USER').default('USER');

export const createSsoProviderSchema = z.object({
  name: z.string().trim().min(1).max(SSO_PROVIDER_NAME_MAX),
  type: ssoProviderTypeSchema,
  clientId: z.string().trim().min(1),
  clientSecret: z.string().min(1),
  allowedDomain: z.string().trim().toLowerCase().min(1),
  provisioningPolicy: provisioningPolicySchema.default('INVITE_ONLY'),
  defaultRole: ssoDefaultRoleSchema,
  attributeMapping: z.record(z.string(), z.string()).nullable().optional(),
});
export type CreateSsoProviderInput = z.input<typeof createSsoProviderSchema>;
export type CreateSsoProviderParsed = z.infer<typeof createSsoProviderSchema>;

export const updateSsoProviderSchema = z.object({
  name: z.string().trim().min(1).max(SSO_PROVIDER_NAME_MAX).optional(),
  clientId: z.string().trim().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  allowedDomain: z.string().trim().toLowerCase().min(1).optional(),
  provisioningPolicy: provisioningPolicySchema.optional(),
  defaultRole: z.literal('USER').optional(),
  attributeMapping: z.record(z.string(), z.string()).nullable().optional(),
});
export type UpdateSsoProviderInput = z.infer<typeof updateSsoProviderSchema>;

export const ssoFinalizeSchema = z.object({
  code: z.string().regex(SSO_FINALIZE_CODE_REGEX, 'Invalid finalize code format'),
});
export type SsoFinalizeInput = z.infer<typeof ssoFinalizeSchema>;

export const ssoConnectSchema = z.object({
  code: z.string().min(1),
});
export type SsoConnectInput = z.infer<typeof ssoConnectSchema>;

export const ssoAuthorizeQuerySchema = z.object({
  redirectTo: z.string().optional(),
  inviteToken: z.string().optional(),
});
export type SsoAuthorizeQuery = z.infer<typeof ssoAuthorizeQuerySchema>;

export const ssoCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});
export type SsoCallbackQuery = z.infer<typeof ssoCallbackQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

/** Mask used for client secret in admin responses. */
export const SSO_CLIENT_SECRET_MASK = '••••••••';

/** Admin view of an SSO provider. Secret is always masked. */
export const ssoProviderSchema = z.object({
  id: z.guid(),
  name: z.string(),
  type: ssoProviderTypeSchema,
  isEnabled: z.boolean(),
  clientId: z.string(),
  /** Always the mask string; the real secret is never exposed. */
  clientSecret: z.literal(SSO_CLIENT_SECRET_MASK),
  allowedDomain: z.string(),
  provisioningPolicy: provisioningPolicySchema,
  defaultRole: globalRoleSchema,
  attributeMapping: z.record(z.string(), z.string()).nullable(),
  connectionsCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SsoProvider = z.infer<typeof ssoProviderSchema>;

/** Public view of an enabled provider — shown on the login page. */
export const publicSsoProviderSchema = z.object({
  id: z.guid(),
  name: z.string(),
  type: ssoProviderTypeSchema,
  allowedDomain: z.string(),
});
export type PublicSsoProvider = z.infer<typeof publicSsoProviderSchema>;

/** Admin view of one connection on a provider's connections page. */
export const ssoProviderConnectionSchema = z.object({
  id: z.guid(),
  externalId: z.string(),
  email: z.string(),
  user: z.object({
    id: z.guid(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
export type SsoProviderConnection = z.infer<typeof ssoProviderConnectionSchema>;

/** A user's own SSO connection, with the provider summary embedded. */
export const userSsoConnectionSchema = z.object({
  id: z.guid(),
  externalId: z.string(),
  email: z.string(),
  provider: z.object({
    id: z.guid(),
    name: z.string(),
    type: ssoProviderTypeSchema,
  }),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
});
export type UserSsoConnection = z.infer<typeof userSsoConnectionSchema>;

/** `POST /auth/sso/:providerId/connect` response. */
export const ssoConnectResponseSchema = z.object({
  connected: z.boolean(),
});
export type SsoConnectResponse = z.infer<typeof ssoConnectResponseSchema>;
