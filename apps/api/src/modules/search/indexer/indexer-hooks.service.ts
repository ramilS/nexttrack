import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DELETE_ISSUE_JOB,
  INDEX_ISSUE_JOB,
  SEARCH_INDEXING_JOB_OPTS,
  SEARCH_INDEXING_QUEUE,
  SearchIndexingJobData,
} from './indexing-queue';

/**
 * Entry point for "this issue changed, re-index it" signals from domain
 * event listeners. Enqueues durable BullMQ jobs instead of touching ES
 * directly, so an ES outage delays indexing (with retries) rather than
 * silently losing the update.
 */
@Injectable()
export class IndexerHooksService {
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
  }

  async onIssueDeleted(issueId: string): Promise<void> {
    await this.queue.add(
      DELETE_ISSUE_JOB,
      { issueId },
      SEARCH_INDEXING_JOB_OPTS,
    );
  }
}
