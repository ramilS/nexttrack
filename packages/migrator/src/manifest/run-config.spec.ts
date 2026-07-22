import { describe, expect, it } from 'vitest';
import { MigrateOptions } from '../commands/migrate.command';
import {
  EXCLUSION_VERSION,
  MIGRATION_SPEC_VERSION,
  buildRunConfig,
} from './run-config';

function options(overrides: Partial<MigrateOptions> = {}): MigrateOptions {
  return {
    sourceUrl: 'https://example.youtrack.cloud',
    sourceToken: 'source-secret',
    targetUrl: 'http://localhost:3001',
    targetToken: 'target-secret',
    migrationSecret: 'migration-secret',
    projects: ['APP'],
    allProjects: false,
    withAttachments: false,
    withTimeTracking: false,
    withBoards: false,
    withClosedIssues: false,
    estimateField: undefined,
    dryRun: false,
    resume: false,
    checkpointFile: '/tmp/checkpoint.json',
    concurrency: 3,
    batchSize: 50,
    rateLimit: 10,
    verbose: false,
    ...overrides,
  };
}

describe('buildRunConfig', () => {
  it('normalizes URLs and produces a stable uppercase project set', () => {
    const result = buildRunConfig(
      options({
        sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
        targetUrl: 'http://LOCALHOST:3001/',
        projects: ['ops', ' APP ', 'app'],
      }),
    );

    expect(result).toMatchObject({
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      projects: ['APP', 'OPS'],
    });
  });

  it('includes every option that changes migration behavior', () => {
    expect(
      buildRunConfig(
        options({
          projects: ['OPS'],
          allProjects: true,
          withAttachments: true,
          withTimeTracking: true,
          withBoards: true,
          withClosedIssues: true,
          estimateField: 'Story Points',
          dryRun: true,
          concurrency: 7,
          batchSize: 75,
          rateLimit: 19,
        }),
      ),
    ).toEqual({
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      projects: ['OPS'],
      allProjects: true,
      withAttachments: true,
      withTimeTracking: true,
      withBoards: true,
      withClosedIssues: true,
      estimateField: 'Story Points',
      dryRun: true,
      concurrency: 7,
      batchSize: 75,
      rateLimit: 19,
    });
  });

  it('omits credentials and operational-only options', () => {
    const serialized = JSON.stringify(
      buildRunConfig(
        options({
          sourceToken: 'source-secret',
          targetToken: 'target-secret',
          migrationSecret: 'migration-secret',
          checkpointFile: '/secret/checkpoint.json',
          resume: true,
          verbose: true,
        }),
      ),
    );

    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('checkpointFile');
    expect(serialized).not.toContain('resume');
    expect(serialized).not.toContain('verbose');
  });

  it.each([
    'https://user:password@example.youtrack.cloud',
    'https://example.youtrack.cloud?token=secret',
    'https://example.youtrack.cloud#secret',
  ])('rejects unsafe base URL components without echoing their values: %s', (sourceUrl) => {
    expect(() => buildRunConfig(options({ sourceUrl }))).toThrow(
      'Migration base URLs must not contain credentials, query strings, or fragments',
    );
  });

  it.each([
    'A',
    'TOO-LONG-PROJECT',
    'access_token=secret',
    'APP\nINJECTED',
    'Bearer abcdefghijklmnopqrstuvwxyz',
  ])('rejects an unsafe project key without echoing it: %s', (project) => {
    expect(() => buildRunConfig(options({ projects: [project] }))).toThrow(
      'Migration project keys are invalid',
    );
    try {
      buildRunConfig(options({ projects: [project] }));
    } catch (error) {
      expect((error as Error).message).not.toContain(project);
    }
  });

  it.each([
    ['concurrency', 0], ['concurrency', 101], ['concurrency', 1.5],
    ['batchSize', 0], ['batchSize', 501], ['rateLimit', 0], ['rateLimit', 1_001],
  ] as const)('rejects a value outside the server %s bounds', (field, value) => {
    expect(() => buildRunConfig(options({ [field]: value }))).toThrow(
      `Migration ${field} is invalid`,
    );
  });

  it('pins the manifest semantic versions', () => {
    expect(MIGRATION_SPEC_VERSION).toBe('2026-07-14');
    expect(EXCLUSION_VERSION).toBe('2026-07-14');
  });
});
