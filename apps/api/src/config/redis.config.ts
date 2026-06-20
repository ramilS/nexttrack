import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  url: z.string().default('redis://localhost:6379'),
});

export type RedisConfig = z.infer<typeof schema>;

export const redisConfig = registerAs('redis', (): RedisConfig => {
  return schema.parse({
    url: process.env.REDIS_URL,
  });
});
