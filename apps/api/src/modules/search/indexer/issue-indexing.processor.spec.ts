import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { IssueIndexingProcessor } from './issue-indexing.processor';
import { IssueIndexerService } from './issue-indexer.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  REINDEX_PROJECT_JOB,
  SearchIndexingJobData,
} from './indexing-queue';
import { AppLogger } from '@/common/logging/app-logger';

describe('IssueIndexingProcessor', () => {
  let processor: IssueIndexingProcessor;
  let indexer: {
    indexIssue: jest.Mock;
    deleteFromIndex: jest.Mock;
    reindexProject: jest.Mock;
  };

  const buildJob = (
    name: string,
    data: SearchIndexingJobData,
  ): Job<SearchIndexingJobData> =>
    ({
      name,
      data,
      attemptsMade: 0,
      opts: { attempts: 5 },
    }) as Job<SearchIndexingJobData>;

  beforeEach(async () => {
    indexer = {
      indexIssue: jest.fn().mockResolvedValue('indexed'),
      deleteFromIndex: jest.fn().mockResolvedValue(undefined),
      reindexProject: jest.fn().mockResolvedValue({ indexed: 3, errors: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueIndexingProcessor,
        { provide: IssueIndexerService, useValue: indexer },
      ],
    }).compile();

    processor = module.get(IssueIndexingProcessor);
  });

  it('dispatches index jobs to indexIssue', async () => {
    await processor.process(
      buildJob(INDEX_ISSUE_JOB, { issueId: 'issue-1', reason: 'created' }),
    );

    expect(indexer.indexIssue).toHaveBeenCalledWith('issue-1');
    expect(indexer.deleteFromIndex).not.toHaveBeenCalled();
  });

  it('logs the indexing outcome on success so the create path is traceable end-to-end', async () => {
    const logSpy = jest
      .spyOn(AppLogger.prototype, 'log')
      .mockImplementation(() => {});

    await processor.process(
      buildJob(INDEX_ISSUE_JOB, { issueId: 'issue-1', reason: 'issue_created' }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      'Issue indexed',
      expect.objectContaining({
        issueId: 'issue-1',
        reason: 'issue_created',
        outcome: 'indexed',
      }),
    );
    logSpy.mockRestore();
  });

  it('dispatches delete jobs to deleteFromIndex', async () => {
    await processor.process(buildJob(DELETE_ISSUE_JOB, { issueId: 'issue-1' }));

    expect(indexer.deleteFromIndex).toHaveBeenCalledWith('issue-1');
    expect(indexer.indexIssue).not.toHaveBeenCalled();
  });

  it('re-throws indexing failures so BullMQ retries', async () => {
    indexer.indexIssue.mockRejectedValue(new Error('ES down'));

    await expect(
      processor.process(
        buildJob(INDEX_ISSUE_JOB, { issueId: 'issue-1', reason: 'created' }),
      ),
    ).rejects.toThrow('ES down');
  });

  it('re-throws delete failures so BullMQ retries', async () => {
    indexer.deleteFromIndex.mockRejectedValue(new Error('ES down'));

    await expect(
      processor.process(buildJob(DELETE_ISSUE_JOB, { issueId: 'issue-1' })),
    ).rejects.toThrow('ES down');
  });

  it('dispatches reindex-project jobs to reindexProject', async () => {
    await processor.process(
      buildJob(REINDEX_PROJECT_JOB, { projectId: 'proj-1', reason: 'migration' }),
    );

    expect(indexer.reindexProject).toHaveBeenCalledWith('proj-1');
    expect(indexer.indexIssue).not.toHaveBeenCalled();
  });

  it('re-throws reindex-project failures so BullMQ retries', async () => {
    indexer.reindexProject.mockRejectedValue(new Error('ES down'));

    await expect(
      processor.process(
        buildJob(REINDEX_PROJECT_JOB, { projectId: 'proj-1', reason: 'migration' }),
      ),
    ).rejects.toThrow('ES down');
  });

  it('skips unknown job names without touching the indexer', async () => {
    await processor.process(buildJob('unknown', { issueId: 'issue-1' }));

    expect(indexer.indexIssue).not.toHaveBeenCalled();
    expect(indexer.deleteFromIndex).not.toHaveBeenCalled();
  });
});
