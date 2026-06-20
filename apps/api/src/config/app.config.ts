import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean } from './helpers';

const schema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3001),
  apiUrl: z.url().default('http://localhost:3001'),
  webUrl: z.url().default('http://localhost:3000'),
  requestTimeoutMs: z.coerce.number().int().min(1).max(600_000).default(30_000),
  // Swagger UI + /docs-json are an unauthenticated surface — off unless
  // explicitly enabled (dev/staging).
  swaggerEnabled: envBoolean(false),
});

export type AppConfig = z.infer<typeof schema>;

export const appConfig = registerAs('app', (): AppConfig => {
  return schema.parse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.API_PORT,
    apiUrl: process.env.API_URL,
    webUrl: process.env.WEB_URL,
    requestTimeoutMs: process.env.APP_REQUEST_TIMEOUT_MS,
    swaggerEnabled: process.env.SWAGGER_ENABLED,
  });
});
