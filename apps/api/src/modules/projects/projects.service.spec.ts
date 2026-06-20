import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
} from '@/common/errors/domain.errors';
import { ProjectsService } from './projects.service';
import { ProjectsRepository, ProjectEntity } from './projects.repository';
import type { ProjectDetail } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectsRepo: Mocked<ProjectsRepository>;

  const userId = 'user-1';

  const buildEntity = (overrides?: Partial<ProjectEntity>): ProjectEntity => ({
    id: 'p1',
    key: 'TEST',
    name: 'Test Project',
    description: null,
    color: '#3b82f6',
    iconUrl: null,
    isPrivate: false,
    archivedAt: null,
    archivedById: null,
    deletedAt: null,
    deletedById: null,
    createdById: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildDetail = (overrides?: Partial<ProjectDetail>): ProjectDetail => ({
    id: 'p1',
    key: 'TEST',
    name: 'Test Project',
    description: null,
    color: '#3b82f6',
    iconUrl: null,
    isPrivate: false,
    isArchived: false,
    membersCount: 1,
    myRole: { id: 'r1', name: 'Project Admin', permissions: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [],
    defaultWorkflow: null,
    tags: [],
    createdBy: { id: userId, name: 'Test', email: 't@t.local', avatarUrl: null },
    ...overrides,
  });

  beforeEach(async () => {
    projectsRepo = {
      existsByKey: jest.fn(),
      findEntityByKey: jest.fn(),
      findPage: jest.fn(),
      findDetailByKey: jest.fn(),
      createWithDefaults: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      setArchive: jest.fn().mockResolvedValue(undefined),
      setDelete: jest.fn().mockResolvedValue(undefined),
      softDeleteCascade: jest.fn().mockResolvedValue(undefined),
      findResolvedStatusIds: jest.fn().mockResolvedValue([]),
      countOpenIssues: jest.fn().mockResolvedValue(0),
    } as unknown as Mocked<ProjectsRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: ProjectsRepository, useValue: projectsRepo },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('create', () => {
    const dto = { key: 'TEST', name: 'Test Project', color: '#3b82f6', isPrivate: false };

    it('creates a project when key is free', async () => {
      projectsRepo.existsByKey.mockResolvedValue(false);
      projectsRepo.createWithDefaults.mockResolvedValue(buildDetail());

      const result = await service.create(dto as never, userId);

      expect(result.key).toBe('TEST');
      expect(projectsRepo.createWithDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'TEST', createdById: userId }),
      );
    });

    it('throws ConflictError if key is taken', async () => {
      projectsRepo.existsByKey.mockResolvedValue(true);
      await expect(service.create(dto as never, userId)).rejects.toThrow(ConflictError);
    });
  });

  describe('findAll', () => {
    it('delegates filters to the repository', async () => {
      projectsRepo.findPage.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 1, perPage: 10, totalPages: 0 },
      });

      await service.findAll(
        { page: 1, perPage: 10, search: 'foo', isArchived: false, myOnly: false } as never,
        userId,
        true,
      );

      expect(projectsRepo.findPage).toHaveBeenCalledWith({
        page: 1,
        perPage: 10,
        search: 'foo',
        isArchived: false,
        myOnly: false,
        userId,
        isAdmin: true,
      });
    });
  });

  describe('findByKey', () => {
    it('returns the project detail when found', async () => {
      projectsRepo.findDetailByKey.mockResolvedValue(buildDetail());
      const result = await service.findByKey('TEST', userId);
      expect(result.key).toBe('TEST');
    });

    it('throws NotFoundError when missing', async () => {
      projectsRepo.findDetailByKey.mockResolvedValue(null);
      await expect(service.findByKey('TEST', userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('applies the patch and returns refreshed detail', async () => {
      projectsRepo.findDetailByKey.mockResolvedValue(buildDetail({ name: 'New Name' }));

      const result = await service.update(buildEntity(), { name: 'New Name' } as never, userId);

      expect(projectsRepo.update).toHaveBeenCalledWith('p1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  describe('archive / unarchive', () => {
    it('archive sets archivedAt and returns refreshed detail', async () => {
      projectsRepo.findDetailByKey.mockResolvedValue(buildDetail({ isArchived: true }));

      await service.archive(buildEntity(), userId);

      expect(projectsRepo.setArchive).toHaveBeenCalledWith('p1', expect.any(Date), userId);
    });

    it('unarchive clears archivedAt', async () => {
      projectsRepo.findDetailByKey.mockResolvedValue(buildDetail());
      await service.unarchive(buildEntity({ archivedAt: new Date() }), userId);
      expect(projectsRepo.setArchive).toHaveBeenCalledWith('p1', null, null);
    });
  });

  describe('softDelete', () => {
    it('cascades soft-delete when no open issues', async () => {
      projectsRepo.findResolvedStatusIds.mockResolvedValue(['done']);
      projectsRepo.countOpenIssues.mockResolvedValue(0);

      await service.softDelete(buildEntity(), userId);

      expect(projectsRepo.softDeleteCascade).toHaveBeenCalledWith('p1', userId);
    });

    it('throws ConflictError when there are open issues', async () => {
      projectsRepo.findResolvedStatusIds.mockResolvedValue(['done']);
      projectsRepo.countOpenIssues.mockResolvedValue(5);

      await expect(service.softDelete(buildEntity(), userId)).rejects.toThrow(
        ConflictError,
      );
      expect(projectsRepo.softDeleteCascade).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores when project is found as deleted', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue(buildEntity({ deletedAt: new Date() }));
      projectsRepo.findDetailByKey.mockResolvedValue(buildDetail());

      await service.restore('TEST', userId);

      expect(projectsRepo.findEntityByKey).toHaveBeenCalledWith('TEST', { mustBeDeleted: true });
      expect(projectsRepo.setDelete).toHaveBeenCalledWith('p1', null, null);
    });

    it('throws NotFoundError when not found', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue(null);
      await expect(service.restore('TEST', userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('assertNotArchived', () => {
    it('throws PermissionDeniedError when project is archived', () => {
      expect(() => service.assertNotArchived(buildEntity({ archivedAt: new Date() }))).toThrow(
        PermissionDeniedError,
      );
    });

    it('does not throw when project is not archived', () => {
      expect(() => service.assertNotArchived(buildEntity())).not.toThrow();
    });
  });
});
