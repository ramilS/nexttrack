import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ProjectsMembersService } from './projects-members.service';
import { ProjectMembersRepository } from './project-members.repository';
import { ProjectEntity } from './projects.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import type { ProjectMember } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const PROJECT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';
const DEV_ROLE_ID = '00000000-0000-0000-0000-000000000002';

describe('ProjectsMembersService', () => {
  let service: ProjectsMembersService;
  let membersRepo: Mocked<ProjectMembersRepository>;
  let rolesRepo: Mocked<RolesRepository>;
  let usersRepo: Mocked<UsersReader>;
  let permissionsCache: { invalidateAll: jest.Mock };

  const project: ProjectEntity = {
    id: 'p1',
    key: 'TEST',
    name: 'Test',
    description: null,
    color: null,
    iconUrl: null,
    isPrivate: false,
    archivedAt: null,
    archivedById: null,
    deletedAt: null,
    deletedById: null,
    createdById: 'u-creator',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const userId = 'u-target';

  const buildMember = (roleId = PROJECT_ADMIN_ROLE_ID): ProjectMember => ({
    user: { id: userId, name: 'Alice', email: 'alice@t.local', avatarUrl: null },
    role: { id: roleId, name: 'Project Admin', permissions: [] },
    joinedAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    membersRepo = {
      isMember: jest.fn().mockResolvedValue(false),
      findMemberIds: jest.fn(),
      filterMembersByUserIds: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn(),
      updateRole: jest.fn(),
      countByRole: jest.fn(),
      removeWithCleanup: jest.fn().mockResolvedValue(undefined),
      searchMembers: jest.fn(),
      searchAddableUsers: jest.fn(),
    } as unknown as Mocked<ProjectMembersRepository>;

    rolesRepo = {
      findById: jest.fn(),
    } as unknown as Mocked<RolesRepository>;

    usersRepo = {
      existsActiveById: jest.fn().mockResolvedValue(true),
    } as unknown as Mocked<UsersReader>;

    permissionsCache = { invalidateAll: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsMembersService,
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: RolesRepository, useValue: rolesRepo },
        { provide: UsersReader, useValue: usersRepo },
        { provide: PermissionsCacheService, useValue: permissionsCache },
      ],
    }).compile();

    service = module.get(ProjectsMembersService);
  });

  describe('findAll', () => {
    it('forwards query to repository', async () => {
      membersRepo.findAll.mockResolvedValue([buildMember()]);

      const result = await service.findAll(project, { search: 'al', role: DEV_ROLE_ID });

      expect(membersRepo.findAll).toHaveBeenCalledWith('p1', {
        search: 'al',
        roleId: DEV_ROLE_ID,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('addMember', () => {
    it('adds member when user exists, role exists, not yet a member', async () => {
      usersRepo.existsActiveById.mockResolvedValue(true);
      rolesRepo.findById.mockResolvedValue({ id: DEV_ROLE_ID, name: 'Developer', permissions: [] });
      membersRepo.isMember.mockResolvedValue(false);
      membersRepo.create.mockResolvedValue(buildMember(DEV_ROLE_ID));

      const result = await service.addMember(project, { userId, roleId: DEV_ROLE_ID } as never, 'inviter');

      expect(membersRepo.create).toHaveBeenCalledWith({
        userId,
        projectId: 'p1',
        roleId: DEV_ROLE_ID,
        invitedBy: 'inviter',
      });
      expect(result.role.id).toBe(DEV_ROLE_ID);
      expect(permissionsCache.invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when user does not exist', async () => {
      usersRepo.existsActiveById.mockResolvedValue(false);
      await expect(
        service.addMember(project, { userId, roleId: DEV_ROLE_ID } as never, 'inviter'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when role does not exist', async () => {
      rolesRepo.findById.mockResolvedValue(null);
      await expect(
        service.addMember(project, { userId, roleId: DEV_ROLE_ID } as never, 'inviter'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already a member', async () => {
      rolesRepo.findById.mockResolvedValue({ id: DEV_ROLE_ID, name: 'Developer', permissions: [] });
      membersRepo.isMember.mockResolvedValue(true);

      await expect(
        service.addMember(project, { userId, roleId: DEV_ROLE_ID } as never, 'inviter'),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateRole', () => {
    it('updates role for an existing member', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: DEV_ROLE_ID });
      rolesRepo.findById.mockResolvedValue({ id: PROJECT_ADMIN_ROLE_ID, name: 'Admin', permissions: [] });
      membersRepo.updateRole.mockResolvedValue(buildMember(PROJECT_ADMIN_ROLE_ID));

      await service.updateRole(project, userId, { roleId: PROJECT_ADMIN_ROLE_ID } as never);

      expect(membersRepo.updateRole).toHaveBeenCalledWith(userId, 'p1', PROJECT_ADMIN_ROLE_ID);
    });

    it('throws NotFoundError when member not found', async () => {
      membersRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateRole(project, userId, { roleId: DEV_ROLE_ID } as never),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when target role not found', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: DEV_ROLE_ID });
      rolesRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateRole(project, userId, { roleId: 'missing' } as never),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when demoting the last admin', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: PROJECT_ADMIN_ROLE_ID });
      rolesRepo.findById.mockResolvedValue({ id: DEV_ROLE_ID, name: 'Developer', permissions: [] });
      membersRepo.countByRole.mockResolvedValue(1);

      await expect(
        service.updateRole(project, userId, { roleId: DEV_ROLE_ID } as never),
      ).rejects.toThrow(ValidationError);
    });

    it('allows demoting an admin when other admins exist', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: PROJECT_ADMIN_ROLE_ID });
      rolesRepo.findById.mockResolvedValue({ id: DEV_ROLE_ID, name: 'Developer', permissions: [] });
      membersRepo.countByRole.mockResolvedValue(2);
      membersRepo.updateRole.mockResolvedValue(buildMember(DEV_ROLE_ID));

      await service.updateRole(project, userId, { roleId: DEV_ROLE_ID } as never);

      expect(membersRepo.updateRole).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('removes a non-admin member', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: DEV_ROLE_ID });
      await service.removeMember(project, userId);
      expect(membersRepo.removeWithCleanup).toHaveBeenCalledWith(userId, 'p1');
      expect(permissionsCache.invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when not a member', async () => {
      membersRepo.findOne.mockResolvedValue(null);
      await expect(service.removeMember(project, userId)).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when removing the last admin', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: PROJECT_ADMIN_ROLE_ID });
      membersRepo.countByRole.mockResolvedValue(1);

      await expect(service.removeMember(project, userId)).rejects.toThrow(ValidationError);
    });

    it('removes the last admin only when other admins exist', async () => {
      membersRepo.findOne.mockResolvedValue({ userId, roleId: PROJECT_ADMIN_ROLE_ID });
      membersRepo.countByRole.mockResolvedValue(3);

      await service.removeMember(project, userId);

      expect(membersRepo.removeWithCleanup).toHaveBeenCalled();
    });
  });

  describe('searchMembers / searchAddableUsers', () => {
    it('searchMembers forwards to repository', async () => {
      membersRepo.searchMembers.mockResolvedValue([]);
      await service.searchMembers(project, 'alice');
      expect(membersRepo.searchMembers).toHaveBeenCalledWith('p1', 'alice');
    });

    it('searchAddableUsers forwards to repository', async () => {
      membersRepo.searchAddableUsers.mockResolvedValue([]);
      await service.searchAddableUsers(project, 'bob');
      expect(membersRepo.searchAddableUsers).toHaveBeenCalledWith('p1', 'bob');
    });
  });
});
