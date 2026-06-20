import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean } from './helpers';

const schema = z.object({
  timeoutMs: z.coerce.number().default(10000),
  maxConsecutiveFailures: z.coerce.number().default(10),
  allowPrivateUrls: envBoolean(false),
  maxResponseBytes: z.coerce.number().default(64 * 1024),
});

export type WebhookConfig = z.infer<typeof schema>;

export const webhookConfig = registerAs('webhook', (): WebhookConfig => {
  return schema.parse({
    timeoutMs: process.env.WEBHOOK_TIMEOUT_MS,
    maxConsecutiveFailures: process.env.WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    allowPrivateUrls: process.env.WEBHOOK_ALLOW_PRIVATE_URLS,
    maxResponseBytes: process.env.WEBHOOK_MAX_RESPONSE_BYTES,
  });
});
