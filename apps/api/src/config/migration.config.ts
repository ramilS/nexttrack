import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { productionSecret } from './helpers';

const schema = z.object({
  apiSecret: productionSecret(32).optional(),
  allowBackdatedRecords: z.boolean(),
});

export type MigrationConfig = z.infer<typeof schema>;

export const migrationConfig = registerAs('migration', (): MigrationConfig => {
  return schema.parse({
    apiSecret: process.env.MIGRATION_API_SECRET,
    allowBackdatedRecords: process.env.MIGRATION_ALLOW_BACKDATED_RECORDS === 'true',
  });
});
