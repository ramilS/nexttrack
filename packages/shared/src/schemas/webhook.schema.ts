import { z } from 'zod';

// Past-tense webhook event names sent to subscribers (Stripe/GitHub style).
// These are the canonical strings stored on ProjectWebhook.eventTypes and
// sent as the X-Event-Type header / payload event field.
export const WEBHOOK_EVENT_TYPES = [
  'ASSIGNEE_CHANGED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'ISSUE_RESOLVED',
  'SPRINT_STARTED',
  'SPRINT_CLOSED',
] as const;

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

// GENERIC delivers the raw event JSON + HMAC signature, for a subscriber the
// user controls. The chat providers are incoming-webhook URLs the user pastes
// from Slack/Discord/Teams — those services expect their own envelope
// (`{text}` / `{content}` / a MessageCard), not our raw payload, and the user
// has no server to verify a signature against, so `secret` is optional for them
// (see the cross-field refine in webhook-validation.pipe.ts's schema builders).
export const WEBHOOK_PROVIDERS = ['GENERIC', 'SLACK', 'DISCORD', 'TEAMS'] as const;
export const webhookProviderSchema = z.enum(WEBHOOK_PROVIDERS);
export type WebhookProvider = z.infer<typeof webhookProviderSchema>;

export const WEBHOOK_SECRET_MIN = 32;
export const WEBHOOK_SECRET_MAX = 256;
export const WEBHOOK_NAME_MAX = 100;

export const createWebhookSchema = z.object({
  name: z.string().trim().min(1).max(WEBHOOK_NAME_MAX),
  url: z.url(),
  provider: webhookProviderSchema.default('GENERIC'),
  // Required for GENERIC, optional (server-generated) for chat providers —
  // enforced by a refine layered on top in webhook-validation.pipe.ts.
  secret: z.string().min(WEBHOOK_SECRET_MIN).max(WEBHOOK_SECRET_MAX).optional(),
  eventTypes: z.array(webhookEventTypeSchema).min(1),
  isEnabled: z.boolean().default(true),
});
export type CreateWebhookInput = z.input<typeof createWebhookSchema>;
export type CreateWebhookParsed = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  name: z.string().trim().min(1).max(WEBHOOK_NAME_MAX).optional(),
  url: z.url().optional(),
  secret: z.string().min(WEBHOOK_SECRET_MIN).max(WEBHOOK_SECRET_MAX).optional(),
  eventTypes: z.array(webhookEventTypeSchema).min(1).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string(),
  url: z.url(),
  provider: webhookProviderSchema,
  eventTypes: z.array(webhookEventTypeSchema),
  isEnabled: z.boolean(),
  lastDeliveryAt: z.iso.datetime().nullable(),
  lastStatusCode: z.number().int().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  disabledAt: z.iso.datetime().nullable(),
  disabledReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdById: z.guid(),
});
export type Webhook = z.infer<typeof webhookSchema>;

export const webhookTestResultSchema = z.object({
  webhook: z.object({
    id: z.guid(),
    name: z.string(),
  }),
  testPayload: z.object({
    event: z.literal('WEBHOOK_TEST'),
    timestamp: z.iso.datetime(),
    data: z.record(z.string(), z.unknown()),
  }),
});
export type WebhookTestResult = z.infer<typeof webhookTestResultSchema>;
