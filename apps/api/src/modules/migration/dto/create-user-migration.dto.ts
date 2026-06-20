import { z } from 'zod';

export const createUserMigrationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(200),
  avatarUrl: z.url().nullable().optional(),
  isBlocked: z.boolean().optional().default(false),
  migratedFrom: z.string().max(50).optional().default('youtrack'),
  ytId: z.string().min(1),
});

export type CreateUserMigrationDto = z.infer<typeof createUserMigrationSchema>;
