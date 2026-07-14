import type { MigrateOptions } from '../commands/migrate.command';

export const MIGRATION_SPEC_VERSION = '2026-07-14' as const;
export const EXCLUSION_VERSION = '2026-07-14' as const;

export interface SafeMigrationRunConfig extends Record<string, unknown> {
  sourceUrl: string;
  targetUrl: string;
  projects: string[];
  allProjects: boolean;
  withAttachments: boolean;
  withTimeTracking: boolean;
  withBoards: boolean;
  withClosedIssues: boolean;
  estimateField: string | null;
  dryRun: boolean;
  concurrency: number;
  batchSize: number;
  rateLimit: number;
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Migration base URLs must not contain credentials, query strings, or fragments',
    );
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, '');
}

export function buildRunConfig(options: MigrateOptions): SafeMigrationRunConfig {
  return {
    sourceUrl: normalizeUrl(options.sourceUrl),
    targetUrl: normalizeUrl(options.targetUrl),
    projects: [
      ...new Set(options.projects.map((project) => project.trim().toUpperCase())),
    ].sort(),
    allProjects: options.allProjects,
    withAttachments: options.withAttachments,
    withTimeTracking: options.withTimeTracking,
    withBoards: options.withBoards,
    withClosedIssues: options.withClosedIssues,
    estimateField: options.estimateField ?? null,
    dryRun: options.dryRun,
    concurrency: options.concurrency,
    batchSize: options.batchSize,
    rateLimit: options.rateLimit,
  };
}
