import { z } from 'zod';

// Telegram only accepts these three parse modes; anything else is rejected at
// delivery time, so constrain it at the input boundary instead.
export const TELEGRAM_PARSE_MODES = ['HTML', 'Markdown', 'MarkdownV2'] as const;
export type TelegramParseMode = (typeof TELEGRAM_PARSE_MODES)[number];
export const TELEGRAM_EVENT_TYPES_MAX = 50;

export const telegramEventTypesSchema = z
  .array(z.string().min(1).max(100))
  .min(1)
  .max(TELEGRAM_EVENT_TYPES_MAX)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: 'Duplicate event types not allowed',
  });

// ─── Request schemas ─────────────────────────────────────────

export const createTelegramConfigSchema = z.object({
  name: z.string().trim().min(1).max(100),
  botToken: z.string().min(1),
  chatId: z.string().min(1),
  messageTemplate: z.string().optional(),
  eventTypes: telegramEventTypesSchema,
  isEnabled: z.boolean().default(true),
  parseMode: z.enum(TELEGRAM_PARSE_MODES).default('HTML'),
});
export type CreateTelegramConfigInput = z.infer<typeof createTelegramConfigSchema>;

export const updateTelegramConfigSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  botToken: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  messageTemplate: z.string().nullable().optional(),
  eventTypes: telegramEventTypesSchema.optional(),
  isEnabled: z.boolean().optional(),
  parseMode: z.enum(TELEGRAM_PARSE_MODES).optional(),
});
export type UpdateTelegramConfigInput = z.infer<typeof updateTelegramConfigSchema>;

// ─── Response schemas ────────────────────────────────────────

/**
 * Response shape of a project's Telegram config — the persisted row minus
 * botToken (a secret), with Date columns serialized to ISO strings.
 */
export const telegramConfigSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  createdById: z.guid(),
  name: z.string(),
  chatId: z.string(),
  parseMode: z.enum(TELEGRAM_PARSE_MODES),
  messageTemplate: z.string().nullable(),
  eventTypes: z.array(z.string()),
  isEnabled: z.boolean(),
  disabledAt: z.iso.datetime().nullable(),
  disabledReason: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastDeliveryAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;

export const telegramTestResultSchema = z.object({
  config: z.object({
    id: z.guid(),
    name: z.string(),
  }),
  testMessage: z.string(),
});
export type TelegramTestResult = z.infer<typeof telegramTestResultSchema>;
