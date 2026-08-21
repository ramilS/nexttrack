import { Injectable } from '@nestjs/common';
import { ApiKeysRepository } from './api-keys.repository';

/**
 * Read-only cross-module surface of the API-keys aggregate. Modules outside
 * api-keys/ inject this instead of ApiKeysRepository, so writes (issue,
 * revoke, touchLastUsed, ...) stay compile-time-confined to the owner
 * module. Exposed globally via ApiKeysModule.
 */
@Injectable()
export class ApiKeysReader {
  constructor(private repo: ApiKeysRepository) {}

  countActiveForUser(userId: string): Promise<number> {
    return this.repo.countActiveForUser(userId);
  }
}
