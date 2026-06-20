import { Test, TestingModule } from '@nestjs/testing';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { WorkflowsService } from './workflows.service';
import { WorkflowsRepository } from './workflows.repository';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import type { Workflow } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let workflowsRepo: Mocked<WorkflowsRepository>;
  let issuesRepo: Mocked<IssuesRepository>;
  let txService: { run: jest.Mock };

  const projectId = 'proj-1';

  const buildWorkflow = (overrides?: Partial<Workflow>): Workflow => ({
    id: 'wf-1',
    projectId,
    name: 'Default',
    isDefault: true,
    statuses: [
      { id: 's1', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
      { id: 's2', name: 'Done', color: '#22c55e', category: 'DONE', isInitial: false, isResolved: true, ordinal: 1 },
    ],
    transitions: [{ id: 't1', name: 'Start', fromStatusId: 's1', toStatusId: 's2', requiredRole: null }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const project: ProjectEntity = {
    id: projectId,
    key: 'PROJ',
    name: 'Project',
    description: null,
    color: null,
    iconUrl: null,
    isPrivate: false,
    archivedAt: null,
    archivedById: null,
    deletedAt: null,
    deletedById: null,
    createdById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    workflowsRepo = {
      findAllByProject: jest.fn(),
      findById: jest.fn(),
      findDefault: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      setDefaultAtomic: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<WorkflowsRepository>;

    issuesRepo = {
      countByProjectAndStatuses: jest.fn().mockResolvedValue(0),
      findBlockedByStatuses: jest.fn().mockResolvedValue([]),
      migrateStatusBatch: jest.fn().mockResolvedValue(0),
    } as unknown as Mocked<IssuesRepository>;

    txService = {
      run: jest.fn().mockImplementation(<T>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: WorkflowsRepository, useValue: workflowsRepo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: TransactionService, useValue: txService },
      ],
    }).compile();

    service = module.get(WorkflowsService);
  });

  describe('findOne', () => {
    it('returns the workflow when found', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow());
      const result = await service.findOne(projectId, 'wf-1');
      expect(result.name).toBe('Default');
    });

    it('throws NotFoundError when missing', async () => {
      workflowsRepo.findById.mockResolvedValue(null);
      await expect(service.findOne(projectId, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('creates a workflow with validated statuses', async () => {
      workflowsRepo.create.mockResolvedValue(buildWorkflow({ name: 'Custom', isDefault: false }));

      const result = await service.create(project, {
        name: 'Custom',
        statuses: [
          { name: 'Todo', isInitial: true, isResolved: false, color: '#ccc', category: 'UNSTARTED', ordinal: 0 },
        ],
        transitions: [],
      } as never);

      expect(result.name).toBe('Custom');
      expect(workflowsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, name: 'Custom', isDefault: false }),
      );
    });

    it('throws ValidationError without an initial status', async () => {
      await expect(
        service.create(project, {
          name: 'Bad',
          statuses: [{ name: 'X', isInitial: false, isResolved: false }],
          transitions: [],
        } as never),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError with multiple initial statuses', async () => {
      await expect(
        service.create(project, {
          name: 'Bad',
          statuses: [
            { name: 'A', isInitial: true, isResolved: false },
            { name: 'B', isInitial: true, isResolved: false },
          ],
          transitions: [],
        } as never),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('updates workflow when no statuses are removed', async () => {
      const wf = buildWorkflow();
      workflowsRepo.findById.mockResolvedValue(wf);
      workflowsRepo.update.mockResolvedValue(wf);

      await service.update(projectId, 'wf-1', {
        name: 'Updated',
        statuses: wf.statuses,
        transitions: wf.transitions,
      } as never);

      expect(workflowsRepo.update).toHaveBeenCalled();
    });

    it('throws ConflictError when removing a status used by issues without migration', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow());
      issuesRepo.countByProjectAndStatuses.mockResolvedValue(3);
      issuesRepo.findBlockedByStatuses.mockResolvedValue([
        { id: 'i1', number: 1, title: 'X', statusId: 's2' },
      ]);

      await expect(
        service.update(projectId, 'wf-1', {
          statuses: [
            { id: 's1', name: 'Open', isInitial: true, isResolved: false },
          ],
          transitions: [],
        } as never),
      ).rejects.toThrow(ConflictError);
    });

    it('runs issue migrations + workflow update inside the transaction', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow());
      issuesRepo.countByProjectAndStatuses.mockResolvedValue(2);
      workflowsRepo.update.mockResolvedValue(buildWorkflow());

      await service.update(projectId, 'wf-1', {
        statuses: [
          { id: 's1', name: 'Open', isInitial: true, isResolved: false, ordinal: 0 },
          { id: 's3', name: 'Closed', isInitial: false, isResolved: true, ordinal: 1 },
        ],
        transitions: [],
        migrateStatusMapping: { s2: 's3' },
      } as never);

      expect(issuesRepo.migrateStatusBatch).toHaveBeenCalledWith(
        projectId,
        's2',
        's3',
        true,
        expect.anything(),
      );
      expect(workflowsRepo.update).toHaveBeenCalled();
    });

    it('throws ValidationError when migration target is not in new statuses', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow());
      issuesRepo.countByProjectAndStatuses.mockResolvedValue(1);

      await expect(
        service.update(projectId, 'wf-1', {
          statuses: [
            { id: 's1', name: 'Open', isInitial: true, isResolved: false },
          ],
          transitions: [],
          migrateStatusMapping: { s2: 'missing' },
        } as never),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('setDefault', () => {
    it('atomically replaces the default workflow', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow());

      await service.setDefault(projectId, 'wf-1');

      expect(workflowsRepo.setDefaultAtomic).toHaveBeenCalledWith(projectId, 'wf-1');
    });
  });

  describe('remove', () => {
    it('deletes a non-default workflow', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow({ isDefault: false }));
      await service.remove(projectId, 'wf-1');
      expect(workflowsRepo.delete).toHaveBeenCalledWith('wf-1');
    });

    it('throws ValidationError when deleting the default workflow', async () => {
      workflowsRepo.findById.mockResolvedValue(buildWorkflow({ isDefault: true }));
      await expect(service.remove(projectId, 'wf-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('getDefaultStatuses', () => {
    it('returns the default workflow statuses', async () => {
      workflowsRepo.findDefault.mockResolvedValue(buildWorkflow());
      const result = await service.getDefaultStatuses(projectId);
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundError when no default exists', async () => {
      workflowsRepo.findDefault.mockResolvedValue(null);
      await expect(service.getDefaultStatuses(projectId)).rejects.toThrow(NotFoundError);
    });
  });
});
