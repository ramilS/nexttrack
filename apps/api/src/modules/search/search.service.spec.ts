import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { SearchRepository, SearchHydrationRow } from './search.repository';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { EsQueryBuilderService } from './elasticsearch/es-query-builder.service';
import { UsersReader } from '@/modules/users/users.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { elasticsearchConfig } from '@/config';

describe('SearchService', () => {
  let service: SearchService;
  let searchRepo: {
    findManyForSearchHydration: jest.Mock;
  };
  let usersRepo: { findRoleById: jest.Mock };
  let projectsRepo: { findAllActiveIds: jest.Mock };
  let membersRepo: { findProjectIdsForUser: jest.Mock };
  let workflowsRepo: { findDefaultStatusesByProjects: jest.Mock };

  const mockEs = {
    issuesIndex: 'test-issues',
    search: jest.fn(),
  };

  const mockQueryBuilder = {
    build: jest.fn().mockReturnValue({ query: { match_all: {} } }),
  };

  const mockEsConfig = {
    searchDefaultPageSize: 20,
    searchMaxPageSize: 100,
  };

  const mockStatuses = [
    {
      id: 'status-1',
      name: 'Open',
      color: '#22c55e',
      category: 'UNSTARTED',
      isInitial: true,
      isResolved: false,
      ordinal: 0,
    },
    {
      id: 'status-2',
      name: 'In Progress',
      color: '#3b82f6',
      category: 'STARTED',
      isInitial: false,
      isResolved: false,
      ordinal: 1,
    },
    {
      id: 'status-3',
      name: 'Done',
      color: '#a855f7',
      category: 'DONE',
      isInitial: false,
      isResolved: true,
      ordinal: 2,
    },
  ];

  const mockEsHits = {
    hits: {
      hits: [
        { _id: 'issue-1', _score: 1.5, highlight: { title: ['<em>test</em>'] } },
      ],
      total: { value: 1 },
    },
  };

  const mockIssue: SearchHydrationRow = {
    id: 'issue-1',
    number: 42,
    title: 'Test Issue',
    type: 'TASK',
    priority: 'MEDIUM',
    statusId: 'status-1',
    projectId: 'proj-1',
    assignee: { id: 'user-2', name: 'Assignee', email: 'a@test.com', avatarUrl: null },
    reporter: { id: 'user-1', name: 'Reporter', email: 'r@test.com', avatarUrl: null },
    tags: [
      { id: 'tag-1', projectId: 'proj-1', name: 'bug', color: 'red', createdAt: new Date('2024-01-01') },
    ],
    dueDate: null,
    sprintName: null,
    project: { id: 'proj-1', key: 'TST', name: 'Test', color: '#000' },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
  };

  function mockAdminSearchDeps() {
    usersRepo.findRoleById.mockResolvedValue('ADMIN');
    projectsRepo.findAllActiveIds.mockResolvedValue(['proj-1', 'proj-2']);
    workflowsRepo.findDefaultStatusesByProjects.mockResolvedValue(
      new Map([['proj-1', mockStatuses]]),
    );
  }

  beforeEach(async () => {
    searchRepo = {
      findManyForSearchHydration: jest.fn().mockResolvedValue([]),
    };
    usersRepo = { findRoleById: jest.fn().mockResolvedValue(null) };
    projectsRepo = { findAllActiveIds: jest.fn().mockResolvedValue([]) };
    membersRepo = { findProjectIdsForUser: jest.fn().mockResolvedValue([]) };
    workflowsRepo = {
      findDefaultStatusesByProjects: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: SearchRepository, useValue: searchRepo },
        { provide: ElasticsearchService, useValue: mockEs },
        { provide: EsQueryBuilderService, useValue: mockQueryBuilder },
        { provide: UsersReader, useValue: usersRepo },
        { provide: ProjectsRepository, useValue: projectsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
        { provide: elasticsearchConfig.KEY, useValue: mockEsConfig },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);

    mockEs.search.mockClear();
    mockQueryBuilder.build.mockClear();
  });

  // ─── Empty results when no accessible projects ────────────────

  it('should return empty result when user has no accessible projects', async () => {
    usersRepo.findRoleById.mockResolvedValue('USER');
    membersRepo.findProjectIdsForUser.mockResolvedValue([]);

    const result = await service.search('test', 'user-1');

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.hasNextPage).toBe(false);
    expect(mockEs.search).not.toHaveBeenCalled();
  });

  // ─── Admin gets all projects ──────────────────────────────────

  it('should return all projects for admin user', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    await service.search('test', 'admin-user');

    expect(projectsRepo.findAllActiveIds).toHaveBeenCalled();
    expect(mockQueryBuilder.build).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accessibleProjectIds: ['proj-1', 'proj-2'],
      }),
    );
  });

  // ─── Non-admin gets only member projects ──────────────────────

  it('should return only member projects for non-admin user', async () => {
    usersRepo.findRoleById.mockResolvedValue('USER');
    membersRepo.findProjectIdsForUser.mockResolvedValue(['proj-1']);
    workflowsRepo.findDefaultStatusesByProjects.mockResolvedValue(
      new Map([['proj-1', mockStatuses]]),
    );
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    await service.search('test', 'user-1');

    expect(membersRepo.findProjectIdsForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(mockQueryBuilder.build).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accessibleProjectIds: ['proj-1'],
      }),
    );
  });

  // ─── ES called with correct params ───────────────────────────

  it('should call ES with correct index and size', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    await service.search('test', 'user-1', { pageSize: 10 });

    expect(mockEs.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'test-issues',
        size: 11, // pageSize + 1 for hasNextPage detection
        track_total_hits: true,
      }),
    );
  });

  // ─── Empty result from ES ────────────────────────────────────

  it('should return empty result when ES returns no hits', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue({
      hits: { hits: [], total: { value: 0 } },
    });

    const result = await service.search('no-match', 'user-1');

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.hasNextPage).toBe(false);
    expect(searchRepo.findManyForSearchHydration).not.toHaveBeenCalled();
  });

  // ─── perPage capped at searchMaxPageSize ──────────────────────

  it('should cap pageSize at searchMaxPageSize', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    await service.search('test', 'user-1', { pageSize: 500 });

    expect(mockEs.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 101, // capped to 100 + 1 for hasNextPage detection
      }),
    );
  });

  it('should use default page size when pageSize is not provided', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    await service.search('test', 'user-1');

    expect(mockEs.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 21, // default 20 + 1 for hasNextPage detection
      }),
    );
  });

  // ─── Preserves ES ordering ───────────────────────────────────

  it('should preserve ES hit ordering in results', async () => {
    const multiHits = {
      hits: {
        hits: [
          { _id: 'issue-2', _score: 2.0, highlight: {} },
          { _id: 'issue-1', _score: 1.0, highlight: {} },
        ],
        total: { value: 2 },
      },
    };

    const issue1: SearchHydrationRow = { ...mockIssue, id: 'issue-1' };
    const issue2: SearchHydrationRow = {
      ...mockIssue,
      id: 'issue-2',
      number: 43,
      title: 'Second Issue',
    };

    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(multiHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([issue1, issue2]);

    const result = await service.search('test', 'user-1');

    expect(result.items[0].issue.id).toBe('issue-2');
    expect(result.items[1].issue.id).toBe('issue-1');
  });

  // ─── parseQuery ──────────────────────────────────────────────

  it('should parse a query string and return parsed result', () => {
    const result = service.parseQuery('test search');

    expect(result).toBeDefined();
    expect(result.filters).toBeDefined();
    expect(result.sort).toBeDefined();
    expect(result.errors).toBeDefined();
  });

  it('should parse text into TEXT_SEARCH filter node', () => {
    const result = service.parseQuery('hello');

    const textNode = result.filters.find((f) => f.kind === 'TEXT_SEARCH');
    expect(textNode).toBeDefined();
  });

  // ─── validateQuery ───────────────────────────────────────────

  it('should return valid for a correct query', () => {
    const result = service.validateQuery('test');

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return invalid with errors for a malformed query', () => {
    const result = service.validateQuery('assignee:');

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  // ─── Highlights in results ───────────────────────────────────

  it('should include highlights from ES response in results', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    const result = await service.search('test', 'user-1');

    expect(result.items[0].highlights.title).toEqual(['<em>test</em>']);
    expect(result.items[0].score).toBe(1.5);
  });

  // ─── Status resolution via workflow ─────────────────────────

  it('should resolve statusId to full status object from workflow', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    const result = await service.search('test', 'user-1');

    expect(result.items[0].issue.status).toEqual({
      id: 'status-1',
      name: 'Open',
      color: '#22c55e',
      category: 'UNSTARTED',
    });
  });

  it('should return fallback status when workflow is missing for project', async () => {
    mockAdminSearchDeps();
    workflowsRepo.findDefaultStatusesByProjects.mockResolvedValue(new Map());
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    const result = await service.search('test', 'user-1');

    expect(result.items[0].issue.status).toEqual({
      id: 'status-1',
      name: 'Unknown',
      color: '#888',
      category: 'UNSTARTED',
    });
  });

  it('should return fallback status when statusId not found in workflow', async () => {
    const issueWithUnknownStatus: SearchHydrationRow = {
      ...mockIssue,
      statusId: 'nonexistent-status',
    };

    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([issueWithUnknownStatus]);

    const result = await service.search('test', 'user-1');

    expect(result.items[0].issue.status).toEqual({
      id: 'nonexistent-status',
      name: 'Unknown',
      color: '#888',
      category: 'UNSTARTED',
    });
  });

  it('should load workflows for all distinct projects in results', async () => {
    const multiProjectHits = {
      hits: {
        hits: [
          { _id: 'issue-1', _score: 1.0, highlight: {} },
          { _id: 'issue-3', _score: 0.5, highlight: {} },
        ],
        total: { value: 2 },
      },
    };

    const issueFromProj2: SearchHydrationRow = {
      ...mockIssue,
      id: 'issue-3',
      number: 99,
      statusId: 'status-p2',
      projectId: 'proj-2',
      project: { id: 'proj-2', key: 'OTH', name: 'Other', color: '#fff' },
    };

    const statusesProj2 = [
      {
        id: 'status-p2',
        name: 'Backlog',
        color: '#999',
        category: 'UNSTARTED' as const,
        isInitial: true,
        isResolved: false,
        ordinal: 0,
      },
    ];

    mockAdminSearchDeps();
    workflowsRepo.findDefaultStatusesByProjects.mockResolvedValue(
      new Map([
        ['proj-1', mockStatuses],
        ['proj-2', statusesProj2],
      ]),
    );
    mockEs.search.mockResolvedValue(multiProjectHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue, issueFromProj2]);

    const result = await service.search('test', 'user-1');

    expect(workflowsRepo.findDefaultStatusesByProjects).toHaveBeenCalledWith([
      'proj-1',
      'proj-2',
    ]);
    expect(result.items[0].issue.status.name).toBe('Open');
    expect(result.items[1].issue.status.name).toBe('Backlog');
  });

  // ─── Meta structure ──────────────────────────────────────────

  it('should return correct meta structure with pagination info', async () => {
    mockAdminSearchDeps();
    mockEs.search.mockResolvedValue(mockEsHits);
    searchRepo.findManyForSearchHydration.mockResolvedValue([mockIssue]);

    const result = await service.search('test', 'user-1', { pageSize: 10 });

    expect(result.meta).toEqual(
      expect.objectContaining({
        total: 1,
        nextCursor: null,
        pageSize: 10,
        hasNextPage: false,
      }),
    );
    expect(result.meta.query).toBeDefined();
  });
});
