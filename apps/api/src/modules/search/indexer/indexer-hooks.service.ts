import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  REINDEX_PROJECT_JOB,
  SEARCH_INDEXING_JOB_OPTS,
  SEARCH_INDEXING_QUEUE,
  SearchIndexingJobData,
} from './indexing-queue';
import { AppLogger } from '@/common/logging/app-logger';

/**
 * Entry point for "this issue changed, re-index it" signals from domain
 * event listeners. Enqueues durable BullMQ jobs instead of touching ES
 * directly, so an ES outage delays indexing (with retries) rather than
 * silently losing the update.
 */
@Injectable()
export class IndexerHooksService {
  private readonly logger = new AppLogger(IndexerHooksService.name);

  constructor(
    @InjectQueue(SEARCH_INDEXING_QUEUE)
    private queue: Queue<SearchIndexingJobData>,
  ) {}

  async onIssueChanged(issueId: string, reason: string): Promise<void> {
    await this.queue.add(
      INDEX_ISSUE_JOB,
      { issueId, reason },
      SEARCH_INDEXING_JOB_OPTS,
    );
    this.logger.debug('Issue re-index scheduled', { issueId, reason });
  }

  async onIssueDeleted(issueId: string): Promise<void> {
    await this.queue.add(
      DELETE_ISSUE_JOB,
      { issueId },
      SEARCH_INDEXING_JOB_OPTS,
    );
    this.logger.debug('Issue de-index scheduled', { issueId });
  }

  // Schedules a full project reindex off the request path. Used after a bulk
  // import (migration), which writes issues directly and bypasses the per-issue
  // hooks above — so a single background reindex catches them all, with the
  // queue's retry/backoff covering a transient ES outage.
  async enqueueProjectReindex(projectId: string, reason: string): Promise<void> {
    await this.queue.add(
      REINDEX_PROJECT_JOB,
      { projectId, reason },
      SEARCH_INDEXING_JOB_OPTS,
    );
    this.logger.log('Project reindex scheduled', { projectId, reason });
  }
}
