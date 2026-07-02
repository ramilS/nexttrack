import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IssueIndexerService } from './issue-indexer.service';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  REINDEX_PROJECT_JOB,
  SEARCH_INDEXING_QUEUE,
  SearchIndexingJobData,
  IndexIssueJobData,
  DeleteIssueJobData,
  ReindexProjectJobData,
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
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    try {
      switch (job.name) {
        case INDEX_ISSUE_JOB: {
          const { issueId, reason } = job.data as IndexIssueJobData;
          const outcome = await this.issueIndexer.indexIssue(issueId);
          // End of the create/update -> ES path: confirms the document actually
          // landed (or was removed). Without this the chain went silent here on
          // success, so an indexing failure was invisible until you dug into the
          // BullMQ failed set.
          this.logger.log('Issue indexed', {
            issueId,
            reason,
            outcome,
            jobId: job.id,
            attempt,
          });
          break;
        }
        case DELETE_ISSUE_JOB: {
          const { issueId } = job.data as DeleteIssueJobData;
          await this.issueIndexer.deleteFromIndex(issueId);
          this.logger.log('Issue de-indexed', {
            issueId,
            jobId: job.id,
            attempt,
          });
          break;
        }
        case REINDEX_PROJECT_JOB: {
          const { projectId, reason } = job.data as ReindexProjectJobData;
          const result = await this.issueIndexer.reindexProject(projectId);
          this.logger.log('Project reindexed', {
            projectId,
            reason,
            indexed: result.indexed,
            errors: result.errors,
            jobId: job.id,
            attempt,
          });
          break;
        }
        default:
          this.logger.warn('Unknown search-indexing job — skipping', {
            job: job.name,
            jobId: job.id,
          });
      }
    } catch (err) {
      this.logger.error('Search-indexing job failed', err, {
        job: job.name,
        jobId: job.id,
        attempt,
        maxAttempts,
      });
      throw err;
    }
  }
}
