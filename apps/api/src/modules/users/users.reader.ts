import { Injectable } from '@nestjs/common';
import type { GlobalRole } from '@prisma/client';
import {
  UsersRepository,
  type UserNameRef,
  type UserPublicRef,
} from './users.repository';

/**
 * Read-only cross-module surface of the users aggregate. Modules outside
 * users/ inject this instead of UsersRepository, so writes stay
 * compile-time-confined to the owner module. Exposed globally via
 * SharedRepositoriesModule.
 */
@Injectable()
export class UsersReader {
  constructor(private repo: UsersRepository) {}

  findPublicRefsByIds(ids: string[]): Promise<UserPublicRef[]> {
    return this.repo.findPublicRefsByIds(ids);
  }

  findNameRefsByIds(ids: string[]): Promise<UserNameRef[]> {
    return this.repo.findNameRefsByIds(ids);
  }

  findActiveIdsByIds(ids: string[]): Promise<string[]> {
    return this.repo.findActiveIdsByIds(ids);
  }

  existsActiveById(userId: string): Promise<boolean> {
    return this.repo.existsActiveById(userId);
  }

  findRoleById(userId: string): Promise<GlobalRole | null> {
    return this.repo.findRoleById(userId);
  }

  findActiveForJwt(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    role: GlobalRole;
    avatarUrl: string | null;
    isBlocked: boolean;
  } | null> {
    return this.repo.findActiveForJwt(userId);
  }

  findEmailAndNameById(
    userId: string,
  ): Promise<{ email: string; name: string } | null> {
    return this.repo.findEmailAndNameById(userId);
  }

  findHasPasswordById(userId: string): Promise<boolean | null> {
    return this.repo.findHasPasswordById(userId);
  }
}
