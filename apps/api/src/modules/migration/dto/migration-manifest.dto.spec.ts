import { canonicalJsonChecksum } from '../migration-json';
import {
  startMigrationRunSchema,
  transitionMigrationEntitySchema,
} from './migration-manifest.dto';

function config(overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: 'https://example.youtrack.cloud',
    targetUrl: 'http://localhost:3001',
    projects: ['APP'],
    allProjects: false,
    withAttachments: false,
    withTimeTracking: false,
    withBoards: false,
    withClosedIssues: false,
    estimateField: null,
    dryRun: false,
    concurrency: 3,
    batchSize: 50,
    rateLimit: 10,
    ...overrides,
  };
}

function runInput(runConfig = config()) {
  return {
    sourceSystem: 'youtrack-cloud' as const,
    sourceTenant: 'example.youtrack.cloud',
    sourceUrl: 'https://example.youtrack.cloud',
    targetUrl: 'http://localhost:3001',
    config: runConfig,
    configHash: canonicalJsonChecksum(runConfig),
    specVersion: '2026-07-14' as const,
    exclusionVersion: '2026-07-14' as const,
  };
}

describe('migration manifest DTO hardening', () => {
  it.each([
    config({ unknown: true }),
    config({ sourceUrl: 'https://other.youtrack.cloud' }),
    config({ projects: ['OPS', 'APP'] }),
    config({ projects: ['APP', 'APP'] }),
    config({ projects: ['access_token=secret'] }),
    config({ estimateField: 'client_secret=secret' }),
    config({ estimateField: 'Bearer abcdefghijklmnopqrstuvwxyz' }),
  ])('rejects non-canonical or unsafe run config %#', (runConfig) => {
    expect(startMigrationRunSchema.safeParse(runInput(runConfig)).success).toBe(
      false,
    );
  });

  it('accepts the exact safe canonical run config', () => {
    expect(startMigrationRunSchema.safeParse(runInput()).success).toBe(true);
  });

  it.each(['lowercase', 'UPSTREAM-ERROR', 'HAS SPACE', 'A'.repeat(101)])(
    'rejects unstable transition error code %s',
    (code) => {
      expect(
        transitionMigrationEntitySchema.safeParse({
          entityType: 'issue',
          sourceId: '2-1',
          sourceChecksum: 'a'.repeat(64),
          status: 'FAILED',
          error: { code, message: 'failed' },
        }).success,
      ).toBe(false);
    },
  );
});
