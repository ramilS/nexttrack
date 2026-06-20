import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IssueIndexerService } from './issue-indexer.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  SEARCH_INDEXING_QUEUE,
  SearchIndexingJobData,
} from './indexing-queue';

/**
 * Consumes `search-indexing` jobs. Failures are logged and re-thrown so
 * BullMQ retries with the backoff configured in `SEARCH_INDEXING_JOB_OPTS`.
 */
@Processor(SEARCH_INDEXING_QUEUE)
@Injectable()
export class IssueIndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(IssueIndexingProcessor.name);

  constructor(private issueIndexer: IssueIndexerService) {
    super();
  }

  async process(job: Job<SearchIndexingJobData>): Promise<void> {
    const { issueId } = job.data;

    try {
      switch (job.name) {
        case INDEX_ISSUE_JOB:
          await this.issueIndexer.indexIssue(issueId);
          break;
        case DELETE_ISSUE_JOB:
          await this.issueIndexer.deleteFromIndex(issueId);
          break;
        default:
          this.logger.warn(
            `Unknown search-indexing job '${job.name}' for issue ${issueId} — skipping`,
          );
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Search-indexing job '${job.name}' failed for issue ${issueId} ` +
          `(attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${error.message}`,
        error.stack,
      );
      throw err;
    }
  }
}
