import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean } from './helpers';

const schema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().default(1025),
  secure: envBoolean(false),
  from: z.string().default('noreply@nexttrack.local'),
  user: z.string().optional(),
  pass: z.string().optional(),
});

export type MailConfig = z.infer<typeof schema>;

export const mailConfig = registerAs('mail', (): MailConfig => {
  return schema.parse({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE,
    from: process.env.MAIL_FROM,
    user: process.env.MAIL_USER || undefined,
    pass: process.env.MAIL_PASS || undefined,
  });
});
