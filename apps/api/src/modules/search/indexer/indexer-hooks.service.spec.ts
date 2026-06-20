import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { IndexerHooksService } from './indexer-hooks.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  SEARCH_INDEXING_QUEUE,
} from './indexing-queue';

describe('IndexerHooksService', () => {
  let service: IndexerHooksService;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerHooksService,
        { provide: getQueueToken(SEARCH_INDEXING_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(IndexerHooksService);
  });

  describe('onIssueChanged', () => {
    it('enqueues an index job with issue id, reason and retry opts', async () => {
      await service.onIssueChanged('issue-1', 'issue_updated');

      expect(queue.add).toHaveBeenCalledWith(
        INDEX_ISSUE_JOB,
        { issueId: 'issue-1', reason: 'issue_updated' },
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
        }),
      );
    });

    it('does not set a custom jobId (dedup would drop sequential updates)', async () => {
      await service.onIssueChanged('issue-1', 'issue_updated');

      const opts = queue.add.mock.calls[0][2];
      expect(opts.jobId).toBeUndefined();
    });

    it('propagates enqueue failures to the caller', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));

      await expect(
        service.onIssueChanged('issue-1', 'issue_updated'),
      ).rejects.toThrow('redis down');
    });
  });

  describe('onIssueDeleted', () => {
    it('enqueues a delete job with issue id and retry opts', async () => {
      await service.onIssueDeleted('issue-1');

      expect(queue.add).toHaveBeenCalledWith(
        DELETE_ISSUE_JOB,
        { issueId: 'issue-1' },
        expect.objectContaining({ attempts: 5 }),
      );
    });
  });
});
