import { Test, TestingModule } from '@nestjs/testing';
import { ValidationError, ConflictError, NotFoundError } from '@/common/errors/domain.errors';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { buildRole } from '@test/helpers';
import { Permission } from '@repo/shared';

function expectedRole(row: ReturnType<typeof buildRole>) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

describe('RolesService', () => {
  let service: RolesService;
  let rolesRepo: Record<string, jest.Mock>;
  let permissionsCache: { invalidateAll: jest.Mock };

  beforeEach(async () => {
    permissionsCache = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
    rolesRepo = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findSystemFlag: jest.fn().mockResolvedValue(null),
      existsByName: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      countAssignedMembers: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: RolesRepository, useValue: rolesRepo },
        { provide: PermissionsCacheService, useValue: permissionsCache },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      const roles = [
        buildRole({ name: 'Project Admin', isSystem: true }),
        buildRole({ name: 'Custom' }),
      ];
      rolesRepo.findAll.mockResolvedValue(roles.map(expectedRole));

      const result = await service.findAll();

      expect(result).toEqual(roles.map(expectedRole));
    });
  });

  describe('findOne', () => {
    it('should return role by id', async () => {
      const role = buildRole();
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));

      const result = await service.findOne(role.id);

      expect(result).toEqual(expectedRole(role));
    });

    it('should throw NotFoundError if not found', async () => {
      rolesRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create a non-system role', async () => {
      const newRole = buildRole({ name: 'QA Lead', isSystem: false });
      rolesRepo.existsByName.mockResolvedValue(false);
      rolesRepo.create.mockResolvedValue(expectedRole(newRole));

      const result = await service.create({
        name: 'QA Lead',
        permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE],
      });

      expect(result).toEqual(expectedRole(newRole));
      expect(rolesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'QA Lead' }),
      );
    });

    it('should throw ConflictError if name taken', async () => {
      rolesRepo.existsByName.mockResolvedValue(true);

      await expect(
        service.create({ name: 'Developer', permissions: [Permission.ISSUE_READ] }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    it('should update role permissions', async () => {
      const role = buildRole({ isSystem: false });
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));
      rolesRepo.update.mockResolvedValue(
        expectedRole({ ...role, permissions: [Permission.ISSUE_READ] }),
      );

      const result = await service.update(role.id, { permissions: [Permission.ISSUE_READ] });

      expect(result.permissions).toEqual([Permission.ISSUE_READ]);
      expect(permissionsCache.invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('should block renaming system roles', async () => {
      const role = buildRole({ isSystem: true, name: 'Project Admin' });
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));

      await expect(
        service.update(role.id, { name: 'Renamed' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should allow updating permissions on system roles', async () => {
      const role = buildRole({ isSystem: true, name: 'Developer' });
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));
      rolesRepo.update.mockResolvedValue(expectedRole(role));

      await expect(
        service.update(role.id, { permissions: [Permission.ISSUE_READ] }),
      ).resolves.toBeDefined();
    });

    it('should throw ConflictError when renaming to a name already taken by another role', async () => {
      const role = buildRole({ isSystem: false, name: 'Old Name' });
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));
      rolesRepo.existsByName.mockResolvedValue(true);

      await expect(
        service.update(role.id, { name: 'Taken' }),
      ).rejects.toThrow(ConflictError);
      expect(rolesRepo.update).not.toHaveBeenCalled();
    });

    it('should allow renaming a role to its own current name', async () => {
      const role = buildRole({ isSystem: false, name: 'Same Name' });
      rolesRepo.findOne.mockResolvedValue(expectedRole(role));
      rolesRepo.update.mockResolvedValue(expectedRole(role));

      await expect(
        service.update(role.id, { name: 'Same Name' }),
      ).resolves.toBeDefined();
      expect(rolesRepo.existsByName).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should block deleting system roles', async () => {
      const role = buildRole({ isSystem: true });
      rolesRepo.findSystemFlag.mockResolvedValue(role);

      await expect(service.remove(role.id)).rejects.toThrow(ValidationError);
    });

    it('should block deleting roles with assigned members', async () => {
      const role = buildRole({ isSystem: false });
      rolesRepo.findSystemFlag.mockResolvedValue(role);
      rolesRepo.countAssignedMembers.mockResolvedValue(3);

      await expect(service.remove(role.id)).rejects.toThrow(ValidationError);
    });

    it('should delete non-system role with no members', async () => {
      const role = buildRole({ isSystem: false });
      rolesRepo.findSystemFlag.mockResolvedValue(role);
      rolesRepo.countAssignedMembers.mockResolvedValue(0);

      await service.remove(role.id);

      expect(rolesRepo.delete).toHaveBeenCalledWith(role.id);
    });
  });
});
