import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  shortTtl: z.coerce.number().int().min(100).max(60_000).default(1_000),
  shortLimit: z.coerce.number().int().min(1).max(10_000).default(3),
  mediumTtl: z.coerce.number().int().min(1_000).max(600_000).default(10_000),
  mediumLimit: z.coerce.number().int().min(1).max(100_000).default(20),
  longTtl: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  longLimit: z.coerce.number().int().min(1).max(1_000_000).default(100),
});

export type ThrottleConfig = z.infer<typeof schema>;

export const throttleConfig = registerAs('throttle', (): ThrottleConfig => {
  return schema.parse({
    shortTtl: process.env.THROTTLE_SHORT_TTL_MS,
    shortLimit: process.env.THROTTLE_SHORT_LIMIT,
    mediumTtl: process.env.THROTTLE_MEDIUM_TTL_MS,
    mediumLimit: process.env.THROTTLE_MEDIUM_LIMIT,
    longTtl: process.env.THROTTLE_LONG_TTL_MS,
    longLimit: process.env.THROTTLE_LONG_LIMIT,
  });
});
