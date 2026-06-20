import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  corsOrigins: z.string().default('http://localhost:3000'),
  adapter: z.enum(['redis', 'memory']).default('redis'),
  presenceTtlSeconds: z.coerce.number().int().min(1).default(300),
  typingTtlSeconds: z.coerce.number().int().min(1).default(5),
});

export type WebsocketConfig = z.infer<typeof schema>;

export const websocketConfig = registerAs('websocket', (): WebsocketConfig => {
  return schema.parse({
    corsOrigins: process.env.WS_CORS_ORIGINS,
    adapter: process.env.WS_ADAPTER,
    presenceTtlSeconds: process.env.WS_PRESENCE_TTL_SECONDS,
    typingTtlSeconds: process.env.WS_TYPING_TTL_SECONDS,
  });
});
