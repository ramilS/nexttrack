import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  url: z.string().min(1),
  poolMin: z.coerce.number().int().min(0).default(2),
  poolMax: z.coerce.number().int().min(1).default(10),
  connectionTimeoutMs: z.coerce.number().int().min(0).max(60_000).default(10_000),
  idleTimeoutMs: z.coerce.number().int().min(0).max(600_000).default(30_000),
});

export type DatabaseConfig = z.infer<typeof schema>;

export const databaseConfig = registerAs('database', (): DatabaseConfig => {
  return schema.parse({
    url: process.env.DATABASE_URL,
    poolMin: process.env.DATABASE_POOL_MIN,
    poolMax: process.env.DATABASE_POOL_MAX,
    connectionTimeoutMs: process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMs: process.env.DATABASE_IDLE_TIMEOUT_MS,
  });
});
