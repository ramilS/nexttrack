import { Test } from '@nestjs/testing';
import { UserKind } from '@prisma/client';
import { ErrorCode } from '@repo/shared';
import { buildUser } from '@test/helpers';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';
import { INTEGRATION_ROLE_ID } from './integration-role';
import { UsersRepository } from '@/modules/users/users.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { TransactionService } from '@/common/repository/transaction.service';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

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
});
