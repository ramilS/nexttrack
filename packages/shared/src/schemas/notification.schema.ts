import { z } from 'zod';

// Mirrors the Prisma `EmailMode` enum (shared has no `@prisma/client` dep).
export const EMAIL_MODES = ['INSTANT', 'DIGEST', 'OFF'] as const;
export const emailModeSchema = z.enum(EMAIL_MODES);
export type EmailMode = z.infer<typeof emailModeSchema>;

/**
 * User-toggleable notification channels — distinct from the async
 * `DeliveryChannel` Prisma enum (EMAIL/WEBHOOK/TELEGRAM): in-app is written
 * straight to the DB, and webhook/telegram are project integrations, not
 * per-user toggles.
 */
export const PREFERENCE_CHANNELS = ['inApp', 'email'] as const;
export const preferenceChannelSchema = z.enum(PREFERENCE_CHANNELS);
export type PreferenceChannel = z.infer<typeof preferenceChannelSchema>;

export const channelToggleSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
});
export type ChannelToggles = z.infer<typeof channelToggleSchema>;

/** Per-notification-type channel toggles, keyed by notification type. */
export type ChannelSettings = Record<string, ChannelToggles>;

// ─── Request schemas ─────────────────────────────────────────

export const notificationQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  isRead: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  type: z.string().optional(),
  projectId: z.guid().optional(),
});
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;

export const markReadSchema = z.object({
  notificationIds: z.array(z.guid()).min(1).max(100),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const updatePreferencesSchema = z.object({
  emailMode: emailModeSchema.optional(),
  emailEnabled: z.boolean().optional(),
  channelSettings: z.record(z.string(), channelToggleSchema).optional(),
  mutedProjectIds: z.array(z.guid()).optional(),
  mutedIssueIds: z.array(z.guid()).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// ─── Response ────────────────────────────────────────────────

// Preferences are keyed by `userId` (one row per user) — that is what the API
// returns and what clients use as a stable key.
export const notificationPreferencesSchema = z.object({
  userId: z.guid(),
  emailMode: emailModeSchema,
  emailEnabled: z.boolean(),
  channelSettings: z.record(z.string(), channelToggleSchema),
  mutedProjectIds: z.array(z.guid()),
  mutedIssueIds: z.array(z.guid()),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * A single notification row as the API returns it: the DB columns the client
 * uses, flattened (no `issue`/`project` includes, no `updatedAt`/email columns)
 * with `createdAt` mapped to an ISO string at the service boundary.
 */
export const notificationItemSchema = z.object({
  id: z.guid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  isRead: z.boolean(),
  groupKey: z.string().nullable(),
  groupCount: z.number().int(),
  issueId: z.guid().nullable(),
  projectId: z.guid().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

/** `GET /notifications/unread-count` response. */
export const unreadCountSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/**
 * One entry of `GET /notifications/channel-options` — the static
 * NOTIFICATION_TYPES_META catalogue describing which channels each
 * notification type can reach.
 */
export const notificationChannelOptionSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  channels: z.array(z.string()),
});
export type NotificationChannelOption = z.infer<
  typeof notificationChannelOptionSchema
>;
