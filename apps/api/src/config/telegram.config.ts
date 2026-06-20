import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  apiBaseUrl: z.string().default('https://api.telegram.org'),
  timeoutMs: z.coerce.number().default(15000),
  maxConsecutiveFailures: z.coerce.number().default(10),
});

export type TelegramConfig = z.infer<typeof schema>;

export const telegramConfig = registerAs('telegram', (): TelegramConfig => {
  return schema.parse({
    apiBaseUrl: process.env.TELEGRAM_API_BASE_URL,
    timeoutMs: process.env.TELEGRAM_TIMEOUT_MS,
    maxConsecutiveFailures: process.env.TELEGRAM_MAX_CONSECUTIVE_FAILURES,
  });
});
