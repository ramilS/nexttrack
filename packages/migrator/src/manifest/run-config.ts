import type { MigrateOptions } from '../commands/migrate.command';
import { sanitizeMigrationErrorMessage } from '../utils/http-error';

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

const PROJECT_KEY_PATTERN = /^[A-Z0-9]{2,10}$/;
const CONFIG_LIMITS = {
  concurrency: { min: 1, max: 100 },
  batchSize: { min: 1, max: 500 },
  rateLimit: { min: 1, max: 1_000 },
} as const;

function normalizeProjects(projects: string[]): string[] {
  const normalized = projects.map((project) => project.trim().toUpperCase());
  if (
    normalized.some(
      (project, index) =>
        !PROJECT_KEY_PATTERN.test(project) ||
        /[\u0000-\u001f\u007f]/.test(projects[index] ?? '') ||
        sanitizeMigrationErrorMessage(projects[index] ?? '') !==
          (projects[index] ?? ''),
    )
  ) {
    throw new Error('Migration project keys are invalid');
  }
  return [...new Set(normalized)].sort();
}

function normalizeEstimateField(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    sanitizeMigrationErrorMessage(value) !== value
  ) {
    throw new Error('Migration estimate field is invalid');
  }
  return normalized;
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new Error(
      'Migration base URLs must not contain credentials, query strings, or fragments',
    );
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, '');
}

function normalizePositiveInteger(
  value: number,
  name: keyof typeof CONFIG_LIMITS,
): number {
  const { min, max } = CONFIG_LIMITS[name];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Migration ${name} is invalid`);
  }
  return value;
}

export function buildRunConfig(options: MigrateOptions): SafeMigrationRunConfig {
  return {
    sourceUrl: normalizeUrl(options.sourceUrl),
    targetUrl: normalizeUrl(options.targetUrl),
    projects: normalizeProjects(options.projects),
    allProjects: options.allProjects,
    withAttachments: options.withAttachments,
    withTimeTracking: options.withTimeTracking,
    withBoards: options.withBoards,
    withClosedIssues: options.withClosedIssues,
    estimateField: normalizeEstimateField(options.estimateField),
    dryRun: options.dryRun,
    concurrency: normalizePositiveInteger(options.concurrency, 'concurrency'),
    batchSize: normalizePositiveInteger(options.batchSize, 'batchSize'),
    rateLimit: normalizePositiveInteger(options.rateLimit, 'rateLimit'),
  };
}
