import { z } from 'zod';
import { userSummarySchema } from './common.schema';

export const ATTACHMENT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const ATTACHMENT_MAX_FILES_PER_UPLOAD = 10;

// ─── Request schemas ─────────────────────────────────────────

export const downloadQuerySchema = z.object({
  inline: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .default(false),
});
export type DownloadQuery = z.infer<typeof downloadQuerySchema>;

// ─── Response schemas ─────────────────────────────────────────

export const attachmentSchema = z.object({
  id: z.guid(),
  issueId: z.guid(),
  uploadedBy: userSummarySchema,
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  sizeFormatted: z.string(),
  isImage: z.boolean(),
  hasThumbnail: z.boolean(),
  /** Relative API path. Issue redirect-style download — open directly in browser. */
  downloadUrl: z.string(),
  /** Relative API path to thumbnail, or null when no thumbnail exists. */
  thumbnailUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  canDelete: z.boolean(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
