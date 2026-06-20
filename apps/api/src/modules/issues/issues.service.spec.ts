import { Test, TestingModule } from '@nestjs/testing';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { IssueType, Priority } from '@prisma/client';
import { IssuesService } from './issues.service';
import { IssuesRepository } from './issues.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { WorkflowEngine } from '@/modules/workflow-automation/workflow-engine';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { UsersReader } from '@/modules/users/users.reader';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { CustomFieldValuesService } from '@/modules/custom-fields/custom-field-values.service';
import { DomainEventPublisher } from '@/modules/outbox/domain-event-publisher';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import type { Workflow } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('IssuesService', () => {
  let service: IssuesService;
  let issuesRepo: Mocked<IssuesRepository>;
  let workflowsRepo: Mocked<WorkflowsReader>;
  let membersRepo: Mocked<ProjectMembersRepository>;
  let tagsRepo: Mocked<TagsRepository>;
  let usersRepo: Mocked<UsersReader>;
  let txService: { run: jest.Mock };
  let customFieldValues: { setInitialFieldValues: jest.Mock };
  let domainEvents: { publish: jest.Mock };
  let workflowEngine: {
    evaluateGuards: jest.Mock;
    findGuardRules: jest.Mock;
    evaluateGuardsForRules: jest.Mock;
  };

  const project: ProjectEntity = {
    id: 'proj-1',
    key: 'TEST',
    name: 'Test',
    description: null,
    color: '#3b82f6',
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

  const workflow: Workflow = {
    id: 'wf-1',
    projectId: 'proj-1',
    name: 'Default',
    isDefault: true,
    statuses: [
      { id: 'open', name: 'Open', isInitial: true, isResolved: false, color: '#ccc', category: 'UNSTARTED', ordinal: 0 },
      { id: 'done', name: 'Done', isInitial: false, isResolved: true, color: '#0f0', category: 'DONE', ordinal: 1 },
    ],
    transitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const buildDetailRow = (overrides?: Record<string, unknown>) => ({
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    description: null,
    type: IssueType.TASK,
    priority: Priority.MEDIUM,
    statusId: 'open',
    projectId: 'proj-1',
    reporterId: 'u1',
    assigneeId: null,
    parentId: null,
    dueDate: null,
    estimate: null,
    spent: 0,
    sprintId: null,
    resolvedAt: null,
    deletedAt: null,
    deletedById: null,
    startDate: null,
    ytId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reporter: { id: 'u1', name: 'Test', email: 't@t.local', avatarUrl: null },
    assignee: null,
    sprint: null,
    tags: [],
    children: [],
    parent: null,
    watchers: [{ userId: 'u1', user: { id: 'u1', name: 'Test', email: 't@t.local', avatarUrl: null } }],
    project: { id: 'proj-1', key: 'TEST', name: 'Test', color: '#3b82f6' },
    _count: { comments: 0, children: 0 },
    ...overrides,
  });

  const buildUpdateContext = (overrides?: Record<string, unknown>) => ({
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    statusId: 'open',
    assigneeId: null,
    description: null,
    resolvedAt: null,
    parentId: null,
    sprintId: null,
    deletedAt: null,
    priority: Priority.MEDIUM,
    type: IssueType.TASK,
    estimate: null,
    dueDate: null,
    ...overrides,
  });

  beforeEach(async () => {
    issuesRepo = {
      getNextNumber: jest.fn().mockResolvedValue(1),
      findEntityByNumber: jest.fn(),
      findDeletedByNumber: jest.fn(),
      findParentInProject: jest.fn(),
      findAncestorChain: jest.fn().mockResolvedValue([]),
      createWithDetails: jest.fn(),
      updateWithTagsTx: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restoreWithDetails: jest.fn(),
      findManyForBulk: jest.fn().mockResolvedValue([]),
      bulkUpdate: jest.fn().mockResolvedValue(0),
      addWatcher: jest.fn().mockResolvedValue(undefined),
      removeWatcher: jest.fn().mockResolvedValue(true),
      findWatchers: jest.fn().mockResolvedValue([]),
      findSprintBoardProjectId: jest.fn(),
    } as unknown as Mocked<IssuesRepository>;

    workflowsRepo = {
      findDefault: jest.fn().mockResolvedValue(workflow),
    } as unknown as Mocked<WorkflowsReader>;

    membersRepo = {
      isMember: jest.fn().mockResolvedValue(true),
    } as unknown as Mocked<ProjectMembersRepository>;

    tagsRepo = {
      countInProject: jest.fn().mockResolvedValue(0),
      replaceIssueLinksBulk: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<TagsRepository>;

    usersRepo = {
      findPublicRefsByIds: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<UsersReader>;

    txService = {
      run: jest.fn().mockImplementation(<T>(fn: (tx: Tx) => Promise<T>) => fn({} as Tx)),
    };
    customFieldValues = { setInitialFieldValues: jest.fn().mockResolvedValue(undefined) };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    workflowEngine = {
      evaluateGuards: jest.fn().mockResolvedValue(undefined),
      findGuardRules: jest.fn().mockResolvedValue([]),
      evaluateGuardsForRules: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: TagsRepository, useValue: tagsRepo },
        { provide: UsersReader, useValue: usersRepo },
        { provide: TransactionService, useValue: txService },
        { provide: CustomFieldValuesService, useValue: customFieldValues },
        { provide: DomainEventPublisher, useValue: domainEvents },
        { provide: WorkflowEngine, useValue: workflowEngine },
      ],
    }).compile();

    service = module.get(IssuesService);
  });

  describe('create', () => {
    const dto: Record<string, unknown> = {
      title: 'New Issue',
      type: IssueType.TASK,
      priority: Priority.MEDIUM,
      description: null,
    };

    it('creates an issue using the workflow initial status', async () => {
      issuesRepo.createWithDetails.mockResolvedValue(buildDetailRow() as never);
      const result = await service.create(project, dto as never, 'u1');
      expect(result.title).toBe('Test Issue');
      expect(issuesRepo.getNextNumber).toHaveBeenCalledWith('proj-1');
      expect(issuesRepo.createWithDetails).toHaveBeenCalledWith(
        expect.objectContaining({ statusId: 'open', reporterId: 'u1' }),
        expect.anything(),
      );
    });

    it('throws when statusId is not in workflow', async () => {
      await expect(
        service.create(project, { ...dto, statusId: 'bogus' } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws when assignee is not a project member', async () => {
      membersRepo.isMember.mockResolvedValue(false);
      await expect(
        service.create(project, { ...dto, assigneeId: 'u2' } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws when parent is not in the same project', async () => {
      issuesRepo.findParentInProject.mockResolvedValue(null);
      await expect(
        service.create(project, { ...dto, parentId: 'p1' } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws when tags do not all belong to the project', async () => {
      tagsRepo.countInProject.mockResolvedValue(1);
      await expect(
        service.create(project, { ...dto, tagIds: ['t1', 't2'] } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('seeds initial custom field values when provided', async () => {
      issuesRepo.createWithDetails.mockResolvedValue(buildDetailRow() as never);
      await service.create(
        project,
        { ...dto, fieldValues: [{ fieldId: 'f1', value: 'x' }] } as never,
        'u1',
      );
      expect(customFieldValues.setInitialFieldValues).toHaveBeenCalledWith(
        expect.any(String),
        project.id,
        'u1',
        [{ fieldId: 'f1', value: 'x' }],
        expect.anything(),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundError when issue missing', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(null);
      await expect(service.update(project, 99, { title: 'X' } as never, 'u1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('updates and emits the IssueUpdatedEvent', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());
      issuesRepo.updateWithTagsTx.mockResolvedValue(buildDetailRow({ title: 'X' }) as never);

      await service.update(project, 1, { title: 'X' } as never, 'u1');

      expect(issuesRepo.updateWithTagsTx).toHaveBeenCalled();
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'issue.updated' }),
        expect.anything(),
      );
    });

    it('passes the expected version through to the conditional update', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());
      issuesRepo.updateWithTagsTx.mockResolvedValue(buildDetailRow({ title: 'X' }) as never);

      await service.update(project, 1, { title: 'X', version: 3 } as never, 'u1');

      expect(issuesRepo.updateWithTagsTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        expect.anything(),
        3,
      );
    });

    it('throws ConflictError when the version claim is lost', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());
      issuesRepo.updateWithTagsTx.mockResolvedValue(null as never);

      await expect(
        service.update(project, 1, { title: 'X', version: 2 } as never, 'u1'),
      ).rejects.toThrow(ConflictError);

      expect(domainEvents.publish).not.toHaveBeenCalled();
    });

    it('throws when statusId is not in workflow', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());
      await expect(
        service.update(project, 1, { statusId: 'bogus' } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws when sprintId is from another project', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());
      issuesRepo.findSprintBoardProjectId.mockResolvedValue('other-project');

      await expect(
        service.update(project, 1, { sprintId: 'sp1' } as never, 'u1'),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('softDelete', () => {
    it('marks the issue deleted and emits the event', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(buildUpdateContext());

      await service.softDelete(project, 1, 'u1');

      expect(issuesRepo.softDelete).toHaveBeenCalledWith('issue-1', 'u1', expect.anything());
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'issue.deleted' }),
        expect.anything(),
      );
    });

    it('throws when missing', async () => {
      issuesRepo.findEntityByNumber.mockResolvedValue(null);
      await expect(service.softDelete(project, 99, 'u1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('restore', () => {
    it('restores when issue is found among deleted', async () => {
      issuesRepo.findDeletedByNumber.mockResolvedValue({ id: 'issue-1' });
      issuesRepo.restoreWithDetails.mockResolvedValue(buildDetailRow() as never);

      await service.restore(project, 1, 'u1');

      expect(issuesRepo.restoreWithDetails).toHaveBeenCalledWith('issue-1', expect.anything());
      expect(domainEvents.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'issue.restored' }),
        expect.anything(),
      );
    });

    it('throws when no deleted issue with that number', async () => {
      issuesRepo.findDeletedByNumber.mockResolvedValue(null);
      await expect(service.restore(project, 99, 'u1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('bulkUpdate', () => {
    it('returns failed for ids that do not belong to the project', async () => {
      issuesRepo.findManyForBulk.mockResolvedValue([{ id: 'i1', statusId: 'open' }]);

      const result = await service.bulkUpdate(
        project,
        { issueIds: ['i1', 'missing'], update: { priority: Priority.HIGH } } as never,
        'u1',
      );

      expect(result.updated).toBe(1);
      expect(result.failed).toEqual(['missing']);
    });

    it('rejects when transition not allowed by workflow', async () => {
      workflowsRepo.findDefault.mockResolvedValue({
        ...workflow,
        transitions: [
          { id: 't1', name: 'Start', fromStatusId: 'open', toStatusId: 'done', requiredRole: null },
        ],
      });
      issuesRepo.findManyForBulk.mockResolvedValue([
        { id: 'i1', statusId: 'done' },
      ]);

      await expect(
        service.bulkUpdate(
          project,
          { issueIds: ['i1'], update: { statusId: 'open' } } as never,
          'u1',
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('watchers', () => {
    it('addWatcher delegates to repository', async () => {
      await service.addWatcher('issue-1', 'u1');
      expect(issuesRepo.addWatcher).toHaveBeenCalledWith('issue-1', 'u1');
    });

    it('removeWatcher silently logs on failure', async () => {
      issuesRepo.removeWatcher.mockRejectedValue(new Error('not found'));
      await expect(service.removeWatcher('issue-1', 'u1')).resolves.not.toThrow();
    });
  });
});
