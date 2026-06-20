import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import { IssueType, Priority } from '@prisma/client';
import { IssuesQueryService } from './issues-query.service';
import { IssuesRepository } from './issues.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectEntity } from '@/modules/projects/projects.repository';
import type { Workflow } from '@repo/shared/schemas';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('IssuesQueryService', () => {
  let service: IssuesQueryService;
  let issuesRepo: Mocked<IssuesRepository>;
  let workflowsRepo: Mocked<WorkflowsReader>;

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

  beforeEach(async () => {
    issuesRepo = {
      findPage: jest.fn().mockResolvedValue({ items: [], meta: { nextCursor: null, pageSize: 25, hasNextPage: false } }),
      findDetailByNumber: jest.fn(),
      findByIdAny: jest.fn(),
      findChildrenList: jest.fn().mockResolvedValue([]),
    } as unknown as Mocked<IssuesRepository>;

    workflowsRepo = {
      findDefault: jest.fn().mockResolvedValue(workflow),
    } as unknown as Mocked<WorkflowsReader>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesQueryService,
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
      ],
    }).compile();

    service = module.get(IssuesQueryService);
  });

  describe('findByNumber', () => {
    it('returns the issue detail when found', async () => {
      issuesRepo.findDetailByNumber.mockResolvedValue(buildDetailRow() as never);
      const result = await service.findByNumber(project, 1, 'u1');
      expect(result.number).toBe(1);
    });

    it('throws NotFoundError when missing', async () => {
      issuesRepo.findDetailByNumber.mockResolvedValue(null);
      await expect(service.findByNumber(project, 99, 'u1')).rejects.toThrow(NotFoundError);
    });
  });
});
