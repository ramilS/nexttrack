import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean, productionSecret } from './helpers';

const schema = z.object({
  accessSecret: productionSecret(32),
  refreshSecret: productionSecret(32),
  accessExpiresIn: z.string().default('15m'),
  refreshExpiresInDays: z.coerce.number().default(30),
  inviteTtlHours: z.coerce.number().default(72),
  localEnabled: envBoolean(true),
});

export type AuthConfig = z.infer<typeof schema>;

export const authConfig = registerAs('auth', (): AuthConfig => {
  return schema.parse({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresInDays: process.env.JWT_REFRESH_EXPIRES_IN
      ? parseInt(process.env.JWT_REFRESH_EXPIRES_IN)
      : undefined,
    inviteTtlHours: process.env.INVITE_TOKEN_TTL_HOURS,
    localEnabled: process.env.AUTH_LOCAL_ENABLED,
  });
});
