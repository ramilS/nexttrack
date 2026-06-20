import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean, productionSecret } from './helpers';

const schema = z.object({
  endpoint: z.string(),
  region: z.string().default('us-east-1'),
  accessKey: z.string().min(1),
  secretKey: productionSecret(8),
  bucket: z.string().default('youtrack-attachments'),
  forcePathStyle: envBoolean(true),
  presignedUrlTtl: z.coerce.number().default(60),
  maxFileSizeBytes: z.coerce.number().default(50 * 1024 * 1024),
  maxFilesPerUpload: z.coerce.number().default(10),
  maxTotalPerIssue: z.coerce.number().default(100),
  thumbnailMaxWidth: z.coerce.number().default(400),
  thumbnailMaxHeight: z.coerce.number().default(300),
  thumbnailQuality: z.coerce.number().default(80),
});

export type StorageConfig = z.infer<typeof schema>;

export const storageConfig = registerAs('storage', (): StorageConfig => {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.MINIO_ENDPOINT;
  const port = process.env.S3_PORT ?? process.env.MINIO_PORT;
  const useSSL = process.env.S3_USE_SSL ?? process.env.MINIO_USE_SSL;
  const protocol = useSSL === 'true' ? 'https' : 'http';
  const fullEndpoint = endpoint?.startsWith('http')
    ? endpoint
    : `${protocol}://${endpoint}${port ? `:${port}` : ''}`;

  return schema.parse({
    endpoint: fullEndpoint,
    region: process.env.S3_REGION,
    accessKey: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY ?? process.env.MINIO_SECRET_KEY,
    bucket: process.env.S3_BUCKET ?? process.env.MINIO_BUCKET,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
    presignedUrlTtl: process.env.PRESIGNED_URL_TTL_SECONDS,
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
