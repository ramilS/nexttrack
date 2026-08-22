import { Test } from '@nestjs/testing';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { buildUser, createMockPrisma } from '@test/helpers';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';
import { INTEGRATION_ROLE_ID } from './integration-role';
import { UsersRepository } from '@/modules/users/users.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { TransactionService } from '@/common/repository/transaction.service';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { apiKeyAuthConfig } from '@/config';

/**
 * Shape of the transaction handle `ProjectMembersRepository.remove` actually
 * calls (a slice of `Prisma.TransactionClient`), for the race-condition test
 * below where we drive the real repository instead of a full mock.
 */
interface FakeMemberCleanupTx {
  issue: { updateMany: jest.Mock };
  issueWatcher: { deleteMany: jest.Mock };
  projectMember: { deleteMany: jest.Mock; delete: jest.Mock };
}

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repo: jest.Mocked<ApiKeysRepository>;
  let usersRepo: jest.Mocked<UsersRepository>;
  let membersRepo: jest.Mocked<ProjectMembersRepository>;

  const PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const CREATOR_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockResolvedValue({
        id: 'key-1',
        projectId: PROJECT_ID,
        userId: 'svc-1',
        name: 'MyTracker',
        prefix: 'nt_abcdefgh',
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
      listByProject: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      revoke: jest.fn().mockResolvedValue(undefined),
      countActiveForUser: jest.fn().mockResolvedValue(0),
      findActiveByHash: jest.fn().mockResolvedValue(null),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ApiKeysRepository>;

    usersRepo = {
      createServicePrincipal: jest
        .fn()
        .mockResolvedValue(buildUser({ id: 'svc-1', kind: UserKind.SERVICE })),
    } as unknown as jest.Mocked<UsersRepository>;

    membersRepo = {
      create: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectMembersRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: repo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        {
          provide: TransactionService,
          useValue: { run: jest.fn((cb: (tx: unknown) => unknown) => cb({})) },
        },
        {
          provide: PermissionsCacheService,
          useValue: { invalidateAll: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: apiKeyAuthConfig.KEY,
          useValue: {
            failedAttemptsLimit: 20,
            failedAttemptsWindowSeconds: 60,
            revokedKeyRetentionDays: 30,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ApiKeysService);
  });

  it('returns the raw key exactly once and stores only its hash', async () => {
    const issued = await service.issue(
      PROJECT_ID,
      { name: 'MyTracker', expiresAt: null },
      CREATOR_ID,
    );

    expect(issued.raw.startsWith('nt_')).toBe(true);
    const stored = repo.create.mock.calls[0][0];
    expect(stored.tokenHash).not.toContain(issued.raw);
    expect(stored.tokenHash).toHaveLength(64);
    expect(Object.values(stored)).not.toContain(issued.raw);
  });

  it('creates a SERVICE principal and adds it as a member with the Integration role', async () => {
    await service.issue(PROJECT_ID, { name: 'MyTracker', expiresAt: null }, CREATOR_ID);

    expect(usersRepo.createServicePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyTracker' }),
      expect.anything(),
    );
    expect(membersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'svc-1',
        projectId: PROJECT_ID,
        roleId: INTEGRATION_ROLE_ID,
      }),
      expect.anything(),
    );
  });

  it('revoking a key removes the principal from the project', async () => {
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: PROJECT_ID,
      userId: 'svc-1',
      name: 'MyTracker',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });

    await service.revoke(PROJECT_ID, 'key-1');

    expect(repo.revoke).toHaveBeenCalledWith('key-1', expect.anything());
    expect(membersRepo.remove).toHaveBeenCalledWith('svc-1', PROJECT_ID, expect.anything());
  });

  it('refuses to revoke a key belonging to another project', async () => {
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: 'cccccccc-0000-0000-0000-000000000001',
      userId: 'svc-1',
      name: 'Other',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });

    await expect(service.revoke(PROJECT_ID, 'key-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it('refuses to revoke a key that is already revoked', async () => {
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: PROJECT_ID,
      userId: 'svc-1',
      name: 'MyTracker',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: new Date(),
      lastUsedAt: null,
      createdAt: new Date(),
    });

    await expect(service.revoke(PROJECT_ID, 'key-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(membersRepo.remove).not.toHaveBeenCalled();
  });

  it('completes without throwing when a concurrent revoke already removed the membership row', async () => {
    // Both concurrent callers read the key as not-yet-revoked before either
    // transaction commits, so both pass the guard in `revoke()`.
    repo.findById.mockResolvedValue({
      id: 'key-1',
      projectId: PROJECT_ID,
      userId: 'svc-1',
      name: 'MyTracker',
      prefix: 'nt_abcdefgh',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });

    // Reproduces the missing-row condition a losing concurrent revoke hits:
    // the winner's transaction already deleted this row, so a real Postgres
    // `deleteMany` reports zero affected rows here — not an error. `delete`
    // is wired to throw so the test fails loudly if the fix regresses back
    // to the non-tolerant call.
    const fakeTx: FakeMemberCleanupTx = {
      issue: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      issueWatcher: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      projectMember: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockRejectedValue(
          Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found.'), {
            code: 'P2025',
          }),
        ),
      },
    };

    // The real repository, not a mock: it is the one whose delegate choice
    // (`deleteMany` vs `delete`) determines whether this scenario throws.
    const realMembersRepo = new ProjectMembersRepository(
      createMockPrisma(),
      new TransactionService(createMockPrisma()),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: repo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: ProjectMembersRepository, useValue: realMembersRepo },
        {
          provide: TransactionService,
          useValue: { run: jest.fn((cb: (tx: FakeMemberCleanupTx) => unknown) => cb(fakeTx)) },
        },
        {
          provide: PermissionsCacheService,
          useValue: { invalidateAll: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: apiKeyAuthConfig.KEY,
          useValue: {
            failedAttemptsLimit: 20,
            failedAttemptsWindowSeconds: 60,
            revokedKeyRetentionDays: 30,
          },
        },
      ],
    }).compile();
    const racingService = moduleRef.get(ApiKeysService);

    await expect(racingService.revoke(PROJECT_ID, 'key-1')).resolves.toBeUndefined();

    expect(fakeTx.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'svc-1', projectId: PROJECT_ID },
    });
    expect(fakeTx.projectMember.delete).not.toHaveBeenCalled();
  });

  describe('list', () => {
    it('passes a retention cutoff computed from the configured window', async () => {
      const before = Date.now() - 30 * 24 * 60 * 60 * 1000;

      await service.list(PROJECT_ID);

      expect(repo.listByProject).toHaveBeenCalledWith(PROJECT_ID, expect.any(Date));
      const cutoff = repo.listByProject.mock.calls[0][1].getTime();
      // Allow a small margin for the test's own execution time between
      // computing `before` and the service computing its own `Date.now()`.
      expect(cutoff).toBeGreaterThanOrEqual(before - 1000);
      expect(cutoff).toBeLessThanOrEqual(before + 1000);
    });
  });
});
