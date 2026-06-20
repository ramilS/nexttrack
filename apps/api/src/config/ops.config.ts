import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  token: z.string().min(16).optional(),
});

export type OpsConfig = z.infer<typeof schema>;

export const opsConfig = registerAs('ops', (): OpsConfig => {
  return schema.parse({
    token: process.env.OPS_TOKEN || undefined,
  });
});
