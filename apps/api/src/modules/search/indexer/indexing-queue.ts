import type { JobsOptions } from 'bullmq';

export const SEARCH_INDEXING_QUEUE = 'search-indexing';

export const INDEX_ISSUE_JOB = 'index';
export const DELETE_ISSUE_JOB = 'delete';
export const REINDEX_PROJECT_JOB = 'reindex-project';

export interface IndexIssueJobData {
  issueId: string;
  reason: string;
}

export interface DeleteIssueJobData {
  issueId: string;
}

export interface ReindexProjectJobData {
  projectId: string;
  reason: string;
}

export type SearchIndexingJobData =
  | IndexIssueJobData
  | DeleteIssueJobData
  | ReindexProjectJobData;

/**
 * Retry/retention policy for search-indexing jobs. Exponential backoff covers
 * transient ES outages (2s → 4s → 8s → 16s → 32s); failed jobs are retained
 * for a week for inspection. No custom jobId — indexing is idempotent, and
 * deduplication by id would silently drop sequential updates to the same issue.
 */
export const SEARCH_INDEXING_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
};
