import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean, productionSecret } from './helpers';

const schema = z.object({
  endpoint: z.url({ protocol: /^https?$/ }),
  region: z.string().default('us-east-1'),
  accessKey: z.string().min(1),
  secretKey: productionSecret(8),
  bucket: z.string().default('youtrack-attachments'),
  forcePathStyle: envBoolean(true),
  // Downloads stream from S3 with no request deadline, so a stalled object
  // store must be cut off here. The socket timeout is idle time, not total
  // time: a slow but live transfer keeps running.
  connectionTimeoutMs: z.coerce.number().int().min(100).max(60_000).default(5_000),
  socketTimeoutMs: z.coerce.number().int().min(100).max(300_000).default(30_000),
  // Browser-cache lifetime of a served attachment. Each fetch is authorized,
  // so this is also how long a revoked or deleted file stays viewable from cache.
  cacheMaxAgeSeconds: z.coerce.number().int().min(0).max(86_400).default(60),
  maxFileSizeBytes: z.coerce.number().default(50 * 1024 * 1024),
  maxFilesPerUpload: z.coerce.number().default(10),
  maxTotalPerIssue: z.coerce.number().default(100),
  thumbnailMaxWidth: z.coerce.number().default(400),
  thumbnailMaxHeight: z.coerce.number().default(300),
  thumbnailQuality: z.coerce.number().default(80),
});

export type StorageConfig = z.infer<typeof schema>;

export const storageConfig = registerAs('storage', (): StorageConfig => {
  const endpoint = process.env.S3_ENDPOINT;
  const port = process.env.S3_PORT;
  const useSSL = process.env.S3_USE_SSL;
  const protocol = useSSL === 'true' ? 'https' : 'http';
  const fullEndpoint =
    !endpoint || endpoint.includes('://')
      ? endpoint
      : `${protocol}://${endpoint}${port ? `:${port}` : ''}`;

  return schema.parse({
    endpoint: fullEndpoint,
    region: process.env.S3_REGION,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucket: process.env.S3_BUCKET,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
    connectionTimeoutMs: process.env.S3_CONNECTION_TIMEOUT_MS,
    socketTimeoutMs: process.env.S3_SOCKET_TIMEOUT_MS,
    cacheMaxAgeSeconds: process.env.ATTACHMENT_CACHE_MAX_AGE_SECONDS,
    maxFileSizeBytes: process.env.ATTACHMENT_MAX_FILE_SIZE_MB
      ? parseInt(process.env.ATTACHMENT_MAX_FILE_SIZE_MB) * 1024 * 1024
      : undefined,
    maxFilesPerUpload: process.env.ATTACHMENT_MAX_FILES_PER_UPLOAD,
    maxTotalPerIssue: process.env.ATTACHMENT_MAX_TOTAL_PER_ISSUE,
    thumbnailMaxWidth: process.env.THUMBNAIL_MAX_WIDTH,
    thumbnailMaxHeight: process.env.THUMBNAIL_MAX_HEIGHT,
    thumbnailQuality: process.env.THUMBNAIL_QUALITY,
  });
});
