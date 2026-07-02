import { z } from 'zod';

export const createUserMigrationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(200),
  // YouTrack avatar URLs are instance-relative paths, not absolute URLs — accept
  // any string (admin import; the avatar is cosmetic and must not reject the user).
  avatarUrl: z.string().nullable().optional(),
  isBlocked: z.boolean().optional().default(false),
  migratedFrom: z.string().max(50).optional().default('youtrack'),
  ytId: z.string().min(1),
});

export type CreateUserMigrationDto = z.infer<typeof createUserMigrationSchema>;
