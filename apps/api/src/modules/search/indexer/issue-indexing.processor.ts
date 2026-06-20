import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IssueIndexerService } from './issue-indexer.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  SEARCH_INDEXING_QUEUE,
  SearchIndexingJobData,
} from './indexing-queue';
import { AppLogger } from '@/common/logging/app-logger';

/**
 * Consumes `search-indexing` jobs. Failures are logged and re-thrown so
 * BullMQ retries with the backoff configured in `SEARCH_INDEXING_JOB_OPTS`.
 */
@Processor(SEARCH_INDEXING_QUEUE)
@Injectable()
export class IssueIndexingProcessor extends WorkerHost {
  private readonly logger = new AppLogger(IssueIndexingProcessor.name);

  constructor(private issueIndexer: IssueIndexerService) {
    super();
  }

  async process(job: Job<SearchIndexingJobData>): Promise<void> {
    const { issueId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    try {
      switch (job.name) {
        case INDEX_ISSUE_JOB:
          await this.issueIndexer.indexIssue(issueId);
          break;
        case DELETE_ISSUE_JOB:
          await this.issueIndexer.deleteFromIndex(issueId);
          break;
        default:
          this.logger.warn('Unknown search-indexing job — skipping', {
            job: job.name,
            issueId,
            jobId: job.id,
          });
      }
    } catch (err) {
      this.logger.error('Search-indexing job failed', err, {
        job: job.name,
        issueId,
        jobId: job.id,
        attempt,
        maxAttempts,
      });
      throw err;
    }
  }
}
