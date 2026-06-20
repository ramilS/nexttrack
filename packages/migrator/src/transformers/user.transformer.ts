import { YtUser } from '../youtrack/types/yt-user.type';

export interface CreateUserMigrationDto {
  email: string;
  name: string;
  avatarUrl: string | null;
  isBlocked: boolean;
  migratedFrom: string;
  ytId: string;
}

export class UserTransformer {
  transform(ytUser: YtUser): CreateUserMigrationDto {
    return {
      email: ytUser.email || `${ytUser.login}@migrated.local`,
      name: ytUser.name || ytUser.login,
      avatarUrl: ytUser.avatarUrl ?? null,
      isBlocked: ytUser.banned ?? false,
      migratedFrom: 'youtrack',
      ytId: ytUser.id,
    };
  }
}
