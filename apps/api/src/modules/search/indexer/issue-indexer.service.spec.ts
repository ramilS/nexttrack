import { Test, TestingModule } from '@nestjs/testing';
import { IssueIndexerService } from './issue-indexer.service';
import { SearchRepository, IndexerIssue } from '@/modules/search/search.repository';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ElasticsearchService } from '@/modules/search/elasticsearch/elasticsearch.service';
import { IndexerHooksService } from './indexer-hooks.service';
import { elasticsearchConfig } from '@/config';
import { NotFoundError } from '@/common/errors/domain.errors';

const page = (items: IndexerIssue[], nextCursor: string | null = null) => ({
  items,
  meta: { nextCursor, pageSize: 100, hasNextPage: nextCursor !== null },
});

const emptyPage = () => page([]);

describe('IssueIndexerService', () => {
  let service: IssueIndexerService;
  let searchRepo: { findForIndex: jest.Mock; findManyForIndex: jest.Mock };
  let projectsRepo: { findAllActiveIds: jest.Mock; findEntityByKey: jest.Mock };
  let indexerHooks: { enqueueProjectReindex: jest.Mock };
  let es: Record<string, jest.Mock | string>;

  beforeEach(async () => {
    es = {
      issuesIndex: 'test-issues',
      index: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      bulk: jest.fn().mockResolvedValue({ items: [] }),
    };

    searchRepo = {
      findForIndex: jest.fn().mockResolvedValue(null),
      findManyForIndex: jest.fn().mockResolvedValue(emptyPage()),
    };

    projectsRepo = {
      findAllActiveIds: jest.fn().mockResolvedValue([]),
      findEntityByKey: jest.fn().mockResolvedValue(null),
    };

    indexerHooks = {
      enqueueProjectReindex: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueIndexerService,
        { provide: SearchRepository, useValue: searchRepo },
        { provide: ProjectsRepository, useValue: projectsRepo },
        { provide: ElasticsearchService, useValue: es },
        { provide: IndexerHooksService, useValue: indexerHooks },
        { provide: elasticsearchConfig.KEY, useValue: { indexerBatchSize: 100 } },
      ],
    }).compile();

    service = module.get(IssueIndexerService);
  });

  const makeIssue = (overrides?: Partial<IndexerIssue>): IndexerIssue => ({
    id: 'issue-1',
    projectId: 'proj-1',
    number: 1,
    title: 'Test Issue',
    description: null,
    statusId: 'status-1',
    priority: 'HIGH',
    type: 'TASK',
    assigneeId: 'user-1',
    assigneeName: 'Alice',
    assigneeEmail: 'alice@test.local',
    reporterId: 'user-2',
    estimate: null,
    spent: null,
    dueDate: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    resolvedAt: null,
    deletedAt: null,
    project: {
      key: 'PRJ',
      memberIds: ['user-1', 'user-2'],
      workflowStatuses: [
        {
          id: 'status-1',
          name: 'Open',
          color: '#fff',
          category: 'UNSTARTED',
          isInitial: true,
          isResolved: false,
          ordinal: 0,
        },
      ],
    },
    tagIds: [],
    tagNames: [],
    customFields: [],
    commentBodies: [],
    ...overrides,
  });

  describe('indexIssue', () => {
    it('should index a found issue', async () => {
      searchRepo.findForIndex.mockResolvedValue(makeIssue());

      const outcome = await service.indexIssue('issue-1');

      expect(outcome).toBe('indexed');
      expect(es.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'test-issues',
          id: 'issue-1',
          refresh: 'wait_for',
          document: expect.objectContaining({
            title: 'Test Issue',
            projectId: 'proj-1',
            projectKey: 'PRJ',
            statusName: 'Open',
            isDeleted: false,
          }),
        }),
      );
    });

    it('should delete from index when issue not found', async () => {
      searchRepo.findForIndex.mockResolvedValue(null);

      const outcome = await service.indexIssue('issue-1');

      expect(outcome).toBe('removed');
      expect(es.delete).toHaveBeenCalledWith({
        index: 'test-issues',
        id: 'issue-1',
        refresh: 'wait_for',
      });
      expect(es.index).not.toHaveBeenCalled();
    });

    it('should extract comment bodies as plain text', async () => {
      const issue = makeIssue({
        commentBodies: [
          { type: 'doc', content: [{ type: 'text', text: 'comment one' }] },
          { type: 'doc', content: [{ type: 'text', text: 'comment two' }] },
        ],
      });
      searchRepo.findForIndex.mockResolvedValue(issue);

      await service.indexIssue('issue-1');

      const doc = (es.index as jest.Mock).mock.calls[0][0].document;
      expect(doc.commentBodies).toContain('comment one');
      expect(doc.commentBodies).toContain('comment two');
    });

    it('should mark deleted issues with isDeleted=true', async () => {
      const issue = makeIssue({ deletedAt: new Date() });
      searchRepo.findForIndex.mockResolvedValue(issue);

      await service.indexIssue('issue-1');

      const doc = (es.index as jest.Mock).mock.calls[0][0].document;
      expect(doc.isDeleted).toBe(true);
    });

    it('should build custom field entries', async () => {
      const issue = makeIssue({
        customFields: [
          { fieldId: 'cf-1', name: 'Summary', type: 'TEXT', value: 'hello' },
        ],
      });
      searchRepo.findForIndex.mockResolvedValue(issue);

      await service.indexIssue('issue-1');

      const doc = (es.index as jest.Mock).mock.calls[0][0].document;
      expect(doc.customFields).toHaveLength(1);
      expect(doc.customFields[0].fieldName).toBe('Summary');
      expect(doc.customFields[0].valueText).toBe('hello');
    });
  });

  describe('deleteFromIndex', () => {
    it('should call es.delete with correct params', async () => {
      await service.deleteFromIndex('issue-1');

      expect(es.delete).toHaveBeenCalledWith({
        index: 'test-issues',
        id: 'issue-1',
        refresh: 'wait_for',
      });
    });
  });

  describe('reindexProject', () => {
    it('should batch-index all issues in a project', async () => {
      const issues = [makeIssue({ id: 'i1' }), makeIssue({ id: 'i2' })];
      searchRepo.findManyForIndex.mockResolvedValueOnce(page(issues));

      (es.bulk as jest.Mock).mockResolvedValue({
        items: [
          { index: { _id: 'i1' } },
          { index: { _id: 'i2' } },
        ],
      });

      const result = await service.reindexProject('proj-1');

      expect(es.bulk).toHaveBeenCalledTimes(1);
      expect(result.indexed).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should follow the cursor across batches', async () => {
      searchRepo.findManyForIndex
        .mockResolvedValueOnce(page([makeIssue({ id: 'i1' })], 'cursor-1'))
        .mockResolvedValueOnce(page([makeIssue({ id: 'i2' })]));

      (es.bulk as jest.Mock).mockResolvedValue({
        items: [{ index: { _id: 'ok' } }],
      });

      const result = await service.reindexProject('proj-1');

      expect(searchRepo.findManyForIndex).toHaveBeenNthCalledWith(
        1,
        'proj-1',
        undefined,
        100,
      );
      expect(searchRepo.findManyForIndex).toHaveBeenNthCalledWith(
        2,
        'proj-1',
        'cursor-1',
        100,
      );
      expect(es.bulk).toHaveBeenCalledTimes(2);
      expect(result.indexed).toBe(2);
    });

    it('should count errors from bulk response', async () => {
      searchRepo.findManyForIndex.mockResolvedValueOnce(page([makeIssue()]));

      (es.bulk as jest.Mock).mockResolvedValue({
        items: [{ index: { error: 'mapping error' } }],
      });

      const result = await service.reindexProject('proj-1');

      expect(result.errors).toBe(1);
      expect(result.indexed).toBe(0);
    });

    it('should handle bulk call failure gracefully', async () => {
      searchRepo.findManyForIndex.mockResolvedValueOnce(page([makeIssue()]));

      (es.bulk as jest.Mock).mockRejectedValue(new Error('ES unavailable'));

      const result = await service.reindexProject('proj-1');

      expect(result.errors).toBe(1);
      expect(result.indexed).toBe(0);
    });
  });

  describe('reindexAll', () => {
    it('should reindex all non-deleted projects', async () => {
      projectsRepo.findAllActiveIds.mockResolvedValue(['p1', 'p2']);
      searchRepo.findManyForIndex.mockResolvedValue(emptyPage());

      const result = await service.reindexAll();

      expect(projectsRepo.findAllActiveIds).toHaveBeenCalled();
      expect(result).toEqual({ indexed: 0, errors: 0 });
    });
  });

  describe('reindexProjectByKey', () => {
    it('resolves the project key to an id and reindexes that project', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue({ id: 'proj-1' });
      searchRepo.findManyForIndex.mockResolvedValueOnce(page([makeIssue({ id: 'i1' })]));
      (es.bulk as jest.Mock).mockResolvedValue({ items: [{ index: { _id: 'i1' } }] });

      const result = await service.reindexProjectByKey('DEVX');

      expect(projectsRepo.findEntityByKey).toHaveBeenCalledWith('DEVX');
      expect(result).toEqual({ indexed: 1, errors: 0, projectId: 'proj-1' });
    });

    it('throws NotFoundError for an unknown project key and indexes nothing', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue(null);

      await expect(service.reindexProjectByKey('NOPE')).rejects.toThrow(NotFoundError);
      expect(es.bulk).not.toHaveBeenCalled();
    });
  });

  describe('scheduleProjectReindex', () => {
    it('enqueues a background reindex without touching ES inline', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue({ id: 'proj-1' });

      const result = await service.scheduleProjectReindex('DEVX');

      expect(indexerHooks.enqueueProjectReindex).toHaveBeenCalledWith(
        'proj-1',
        expect.stringContaining('DEVX'),
      );
      expect(es.bulk).not.toHaveBeenCalled();
      expect(result).toEqual({ queued: true, projectId: 'proj-1' });
    });

    it('throws NotFoundError for an unknown project key and enqueues nothing', async () => {
      projectsRepo.findEntityByKey.mockResolvedValue(null);

      await expect(service.scheduleProjectReindex('NOPE')).rejects.toThrow(NotFoundError);
      expect(indexerHooks.enqueueProjectReindex).not.toHaveBeenCalled();
    });
  });

  describe('scheduleAllReindex', () => {
    it('enqueues one background reindex per active project', async () => {
      projectsRepo.findAllActiveIds.mockResolvedValue(['p1', 'p2', 'p3']);

      const result = await service.scheduleAllReindex();

      expect(indexerHooks.enqueueProjectReindex).toHaveBeenCalledTimes(3);
      expect(indexerHooks.enqueueProjectReindex).toHaveBeenCalledWith('p1', expect.any(String));
      expect(es.bulk).not.toHaveBeenCalled();
      expect(result).toEqual({ queued: true, projects: 3 });
    });
  });
});
