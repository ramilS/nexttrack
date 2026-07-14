import { describe, expect, it, vi } from 'vitest';
import { MigrationCheckpoint } from '../checkpoint/checkpoint.types';
import { MigrateOptions } from '../commands/migrate.command';
import { MigrationRun, OurApiClient } from '../loaders/api-client';
import { sourceChecksum } from './stable-checksum';
import { buildRunConfig } from './run-config';
import {
  MigrationRunCoordinator,
  ResumeConfigMismatchError,
} from './migration-run.coordinator';

function options(overrides: Partial<MigrateOptions> = {}): MigrateOptions {
  return {
    sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
    sourceToken: 'source-secret',
    targetUrl: 'http://LOCALHOST:3001/',
    targetToken: 'target-secret',
    migrationSecret: 'migration-secret',
    projects: ['app'],
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

function runFor(configOptions: MigrateOptions): MigrationRun {
  const config = buildRunConfig(configOptions);
  return {
    id: 'run-1',
    sourceSystem: 'youtrack-cloud',
    sourceTenant: 'example.youtrack.cloud',
    sourceUrl: config.sourceUrl,
    targetUrl: config.targetUrl,
    configHash: sourceChecksum(config),
    specVersion: '2026-07-14',
    exclusionVersion: '2026-07-14',
    status: 'RUNNING',
    startedAt: '2026-07-14T00:00:00.000Z',
    completedAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

function checkpoint(run: MigrationRun): MigrationCheckpoint {
  return {
    version: '0.2.0',
    runId: run.id,
    configHash: run.configHash,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    config: buildRunConfig(options()),
    status: 'RUNNING',
    idMap: {},
    progress: {
      users: { status: 'PENDING', total: null, completed: 0, lastPage: 0, lastId: null },
      projects: {}, issues: {}, comments: {}, tags: {}, attachments: {},
      timeLogs: {}, boards: {}, parentLinks: {}, links: {},
    },
    errors: [],
  };
}

function api(run: MigrationRun) {
  return {
    startMigrationRun: vi.fn().mockResolvedValue({ data: run }),
    getMigrationRun: vi.fn().mockResolvedValue({ data: run, counts: {} }),
  } as unknown as OurApiClient;
}

describe('MigrationRunCoordinator', () => {
  it('starts a new migration run with only the safe immutable config', async () => {
    const opts = options();
    const serverRun = runFor(opts);
    const client = api(serverRun);

    await expect(new MigrationRunCoordinator(client).open(opts, null)).resolves.toEqual({
      runId: 'run-1',
      configHash: serverRun.configHash,
    });

    expect(client.startMigrationRun).toHaveBeenCalledWith({
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      config: buildRunConfig(opts),
      configHash: serverRun.configHash,
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    });
    expect(client.getMigrationRun).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(client.startMigrationRun).mock.calls)).not.toContain(
      'secret',
    );
  });

  it('gets an existing run and accepts the same immutable config on resume', async () => {
    const opts = options({ resume: true });
    const serverRun = runFor(opts);
    const client = api(serverRun);

    await expect(
      new MigrationRunCoordinator(client).open(opts, checkpoint(serverRun)),
    ).resolves.toEqual({ runId: 'run-1', configHash: serverRun.configHash });

    expect(client.getMigrationRun).toHaveBeenCalledWith('run-1');
    expect(client.startMigrationRun).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<MigrateOptions>]>([
    ['projects', { projects: ['OTHER'] }],
    ['withAttachments', { withAttachments: true }],
  ])('rejects changed %s locally with field names only', async (_, change) => {
    const original = options({ resume: true });
    const serverRun = runFor(original);
    const client = api(serverRun);
    const changed = options({ resume: true, ...change });

    const error = await new MigrationRunCoordinator(client)
      .open(changed, checkpoint(serverRun))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResumeConfigMismatchError);
    expect(error).toMatchObject({ code: 'MIGRATION_RESUME_CONFIG_MISMATCH' });
    expect((error as Error).message).toContain('configHash');
    expect((error as Error).message).not.toContain('secret');
    expect(client.startMigrationRun).not.toHaveBeenCalled();
  });

  it.each<[keyof MigrationRun, unknown]>([
    ['sourceSystem', 'other-source'],
    ['sourceTenant', 'other.example'],
    ['sourceUrl', 'https://other.example'],
    ['targetUrl', 'https://target.example'],
    ['configHash', 'b'.repeat(64)],
    ['specVersion', 'other-version'],
    ['exclusionVersion', 'other-version'],
  ])('reports a server %s mismatch by field name without its value', async (field, value) => {
    const opts = options({ resume: true });
    const original = runFor(opts);
    const changed = { ...original, [field]: value } as MigrationRun;
    const client = api(changed);

    const error = await new MigrationRunCoordinator(client)
      .open(opts, checkpoint(original))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResumeConfigMismatchError);
    expect((error as Error).message).toContain(field);
    expect((error as Error).message).not.toContain(String(value));
  });
});
