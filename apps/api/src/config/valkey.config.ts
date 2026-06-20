import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  url: z.string().default('valkey://localhost:6379'),
});

export type ValkeyConfig = z.infer<typeof schema>;

export const valkeyConfig = registerAs('valkey', (): ValkeyConfig => {
  return schema.parse({
    url: process.env.VALKEY_URL,
  });
});
