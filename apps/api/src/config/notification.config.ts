import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  retentionDays: z.coerce.number().default(90),
  emailDelaySeconds: z.coerce.number().default(60),
  digestCron: z.string().default('*/15 * * * *'),
  dueDateCheckCron: z.string().default('0 * * * *'),
  unreadCountCacheTtlSeconds: z.coerce.number().int().min(1).default(30),
});

export type NotificationConfig = z.infer<typeof schema>;

export const notificationConfig = registerAs('notification', (): NotificationConfig => {
  return schema.parse({
    retentionDays: process.env.NOTIFICATION_RETENTION_DAYS,
    emailDelaySeconds: process.env.NOTIFICATION_EMAIL_DELAY_SECONDS,
    digestCron: process.env.NOTIFICATION_DIGEST_CRON,
    dueDateCheckCron: process.env.NOTIFICATION_DUE_DATE_CHECK_CRON,
    unreadCountCacheTtlSeconds: process.env.NOTIFICATION_UNREAD_COUNT_CACHE_TTL_SECONDS,
  });
});
