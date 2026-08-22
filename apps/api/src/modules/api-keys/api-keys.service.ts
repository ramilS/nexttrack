import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import { AppLogger } from '@/common/logging/app-logger';
import { ConflictError, NotFoundError } from '@/common/errors/domain.errors';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { TransactionService } from '@/common/repository/transaction.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { apiKeyAuthConfig } from '@/config';
import { ApiKeyRow, ApiKeysRepository } from './api-keys.repository';
import { generateApiKey } from './api-key-token';
import { INTEGRATION_ROLE_ID } from './integration-role';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IssuedApiKey {
  key: ApiKeyRow;
  /** Returned to the caller once, at creation. Never persisted, never logged. */
  raw: string;
}

export interface IssueApiKeyInput {
  name: string;
  expiresAt: Date | null;
}

const PRINCIPAL_EMAIL_DOMAIN = 'integrations.invalid';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class ApiKeysService {
  private readonly logger = new AppLogger(ApiKeysService.name);

  constructor(
    private repo: ApiKeysRepository,
    private usersRepo: UsersRepository,
    private membersRepo: ProjectMembersRepository,
    private txService: TransactionService,
    private permissionsCache: PermissionsCacheService,
    @Inject(apiKeyAuthConfig.KEY)
    private config: ConfigType<typeof apiKeyAuthConfig>,
  ) {}

  async issue(
    projectId: string,
    input: IssueApiKeyInput,
    createdById: string,
  ): Promise<IssuedApiKey> {
    const { raw, prefix, hash } = generateApiKey();

    const key = await this.createPrincipalAndKey(projectId, input, createdById, prefix, hash);

    await this.permissionsCache.invalidateAll();
    this.logger.log('API key issued', {
      projectId,
      keyId: key.id,
      principalId: key.userId,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    });

    return { key, raw };
  }

  list(projectId: string): Promise<ApiKeyRow[]> {
    const retentionCutoff = new Date(
      Date.now() - this.config.revokedKeyRetentionDays * MS_PER_DAY,
    );
    return this.repo.listByProject(projectId, retentionCutoff);
  }

  async revoke(projectId: string, keyId: string): Promise<void> {
    const key = await this.repo.findById(keyId);
    if (!key || key.projectId !== projectId || key.revokedAt) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    await this.txService.run(async (tx) => {
      await this.repo.revoke(keyId, tx);
      await this.membersRepo.remove(key.userId, projectId, tx);
    });

    await this.permissionsCache.invalidateAll();
    this.logger.log('API key revoked', {
      projectId,
      keyId,
      principalId: key.userId,
    });
  }

  /**
   * Creates the SERVICE principal, its project membership and the key row
   * in one transaction: a key whose principal isn't a project member would
   * authenticate and then be denied every permission check, which is worse
   * than the create failing outright.
   */
  private async createPrincipalAndKey(
    projectId: string,
    input: IssueApiKeyInput,
    createdById: string,
    prefix: string,
    tokenHash: string,
  ): Promise<ApiKeyRow> {
    try {
      return await this.txService.run(async (tx) => {
        const principal = await this.usersRepo.createServicePrincipal(
          { name: input.name, email: this.principalEmail() },
          tx,
        );
        await this.membersRepo.create(
          {
            userId: principal.id,
            projectId,
            roleId: INTEGRATION_ROLE_ID,
            invitedBy: createdById,
          },
          tx,
        );
        return this.repo.create(
          {
            projectId,
            userId: principal.id,
            name: input.name,
            prefix,
            tokenHash,
            expiresAt: input.expiresAt,
            createdById,
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictError(
          ErrorCode.API_KEY_NAME_TAKEN,
          'An API key with this name already exists for this project',
        );
      }
      throw error;
    }
  }

  private principalEmail(): string {
    return `svc.${randomBytes(8).toString('hex')}@${PRINCIPAL_EMAIL_DOMAIN}`;
  }
}
