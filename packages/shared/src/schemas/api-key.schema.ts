import { z } from 'zod';

export const API_KEY_NAME_MAX = 100;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX),
  expiresAt: z.iso.datetime().optional(),
});
export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;
export type CreateApiKeyParsed = z.infer<typeof createApiKeySchema>;

/**
 * The principal (`userId`) backing a key is deliberately never exposed here —
 * it identifies the internal SERVICE user record, not something a project
 * admin manages directly. Same for `tokenHash`: only the SHA-256 hash is
 * persisted and it never leaves the server.
 */
export const apiKeySchema = z.object({
  id: z.guid(),
  name: z.string(),
  prefix: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/**
 * Only the creation response includes `raw` — shown once at issuance and
 * never returned by any other endpoint (see `nestjs-security.md`).
 */
export const issuedApiKeySchema = apiKeySchema.extend({
  raw: z.string(),
});
export type IssuedApiKey = z.infer<typeof issuedApiKeySchema>;
