import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { IssueIndexingProcessor } from './issue-indexing.processor';
import { IssueIndexerService } from './issue-indexer.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  SearchIndexingJobData,
} from './indexing-queue';

describe('IssueIndexingProcessor', () => {
  let processor: IssueIndexingProcessor;
  let indexer: { indexIssue: jest.Mock; deleteFromIndex: jest.Mock };

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
      indexIssue: jest.fn().mockResolvedValue(undefined),
      deleteFromIndex: jest.fn().mockResolvedValue(undefined),
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

  it('skips unknown job names without touching the indexer', async () => {
    await processor.process(buildJob('unknown', { issueId: 'issue-1' }));

    expect(indexer.indexIssue).not.toHaveBeenCalled();
    expect(indexer.deleteFromIndex).not.toHaveBeenCalled();
  });
});
