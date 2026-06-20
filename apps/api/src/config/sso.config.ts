import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { productionHexKey } from './helpers';

const schema = z.object({
  encryptionKey: productionHexKey(64),
  stateTtl: z.coerce.number().default(600),
  finalizeCodeTtl: z.coerce.number().default(30),
});

export type SsoConfig = z.infer<typeof schema>;

export const ssoConfig = registerAs('sso', (): SsoConfig => {
  return schema.parse({
    encryptionKey: process.env.ENCRYPTION_KEY,
    stateTtl: process.env.SSO_STATE_TTL,
    finalizeCodeTtl: process.env.SSO_FINALIZE_CODE_TTL,
  });
});
