import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  MigrateCommand,
  MigrateOptions,
  registerStatusMap,
  registerCustomFieldMap,
} from './migrate.command';
import { IdMapService } from '../id-map/id-map.service';
import { CheckpointService } from '../checkpoint/checkpoint.service';
import { MigrationRunCoordinator } from '../manifest/migration-run.coordinator';
import { ProjectsExtractor } from '../extractors/projects.extractor';
import { UsersExtractor } from '../extractors/users.extractor';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { OurApiClient } from '../loaders/api-client';
import { MigrationCheckpoint } from '../checkpoint/checkpoint.types';
import { SummaryReporter } from '../reporters/summary.reporter';
import { UserTransformer } from '../transformers/user.transformer';
import { canonicalMigratedUser, verifyMigratedUser } from './migrate.command';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerStatusMap', () => {
  it('registers target status ids keyed by status name', () => {
    const idMap = new IdMapService();

    registerStatusMap(idMap, 'DEVX', [
      { id: 'st-1', name: 'Open' },
      { id: 'st-2', name: 'Done' },
    ]);

    expect(idMap.getStatusId('DEVX', 'Open')).toBe('st-1');
    expect(idMap.getStatusId('DEVX', 'Done')).toBe('st-2');
  });
});

describe('registerCustomFieldMap', () => {
  it('registers custom fields and their enum options by name', () => {
    const idMap = new IdMapService();

    registerCustomFieldMap(idMap, [
      { id: 'f1', name: 'Severity', options: [{ id: 'o1', name: 'High' }] },
      { id: 'f2', name: 'Notes', options: [] },
    ]);

    expect(idMap.getCustomFieldId('Severity')).toBe('f1');
    expect(idMap.getEnumOptionId('Severity', 'High')).toBe('o1');
    expect(idMap.getCustomFieldId('Notes')).toBe('f2');
  });
});

describe('manifest-backed migration run lifecycle', () => {
  it('rejects a pre-0.2 checkpoint before project extraction or manifest API calls', async () => {
    vi.spyOn(CheckpointService.prototype, 'load').mockResolvedValue({
      version: '0.1.0',
      startedAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
      config: {},
      status: 'INTERRUPTED',
      idMap: {},
      progress: { tags: {} },
      errors: [],
    } as never);
    const projects = vi.spyOn(ProjectsExtractor.prototype, 'extractProjects');
    const start = vi.spyOn(OurApiClient.prototype, 'startMigrationRun');
    const get = vi.spyOn(OurApiClient.prototype, 'getMigrationRun');

    await expect(
      new MigrateCommand().run(options({ resume: true, allProjects: true, projects: [] })),
    ).rejects.toThrow(/pre-0\.2|new manifest-backed run/i);

    expect(projects).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a 0.2 checkpoint with an empty run identity before API calls', async () => {
    vi.spyOn(CheckpointService.prototype, 'load').mockResolvedValue({
      version: '0.2.0',
      runId: '',
      configHash: 'a'.repeat(64),
      startedAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
      config: {},
      status: 'INTERRUPTED',
      idMap: {},
      progress: { tags: {} },
      errors: [],
    } as never);
    const get = vi.spyOn(OurApiClient.prototype, 'getMigrationRun');

    await expect(new MigrateCommand().run(options({ resume: true }))).rejects.toThrow(
      /runId and configHash is required/i,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('resolves all projects before opening a run and persists its identity immediately', async () => {
    const events: string[] = [];
    vi.spyOn(ProjectsExtractor.prototype, 'extractProjects').mockImplementation(async () => {
      events.push('projects');
      return [{ shortName: 'ops' }, { shortName: 'APP' }] as never;
    });
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockImplementation(async (opts) => {
      events.push(`open:${opts.projects.join(',')}`);
      return { runId: 'run-1', configHash: 'a'.repeat(64) };
    });
    const stopAfterFirstSave = new Error('stop after initial checkpoint save');
    let saveCount = 0;
    const save = vi.spyOn(CheckpointService.prototype, 'save').mockImplementation(async () => {
      events.push('save');
      saveCount++;
      if (saveCount > 1) throw stopAfterFirstSave;
    });
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      new MigrateCommand().run(options({ allProjects: true, projects: [] })),
    ).rejects.toBe(stopAfterFirstSave);

    expect(events.slice(0, 3)).toEqual(['projects', 'open:APP,OPS', 'save']);
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      version: '0.2.0',
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    expect(JSON.stringify(save.mock.calls[0]?.[0])).not.toContain('secret');
    expect(info.mock.calls.flat().join(' ')).toContain('run-1');
  });

  it('persists the same returned run on retry after the initial checkpoint save fails', async () => {
    const events: string[] = [];
    const checkpointWriteFailed = new Error('checkpoint write failed');
    const phaseStopped = new Error('phase stopped');
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockImplementation(async () => {
      events.push('open:run-1');
      return { runId: 'run-1', configHash: 'a'.repeat(64) };
    });
    let saveCount = 0;
    const save = vi
      .spyOn(CheckpointService.prototype, 'save')
      .mockImplementation(async (checkpoint) => {
        saveCount++;
        events.push(`save:${checkpoint.runId}`);
        if (saveCount === 1) throw checkpointWriteFailed;
      });
    vi.spyOn(UsersExtractor.prototype, 'extract').mockImplementation(async function* () {
      events.push('users-phase');
      throw phaseStopped;
    });
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw phaseStopped;
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const commandOptions = options({
      checkpointFile: '/tmp/retry-checkpoint.json',
    });
    await expect(new MigrateCommand().run({ ...commandOptions })).rejects.toBe(
      checkpointWriteFailed,
    );
    expect(events).toEqual(['open:run-1', 'save:run-1']);

    await expect(new MigrateCommand().run({ ...commandOptions })).rejects.toBe(phaseStopped);
    expect(events.slice(2, 6)).toEqual(['open:run-1', 'save:run-1', 'save:run-1', 'users-phase']);
    expect(save.mock.calls[1]?.[0]).toMatchObject({ runId: 'run-1' });
  });
});

describe('manifest-backed user pilot', () => {
  it('builds a canonical payload from every semantic field written by the user transformer', () => {
    const canonical = canonicalMigratedUser({
      id: 'yt-1',
      login: 'Alice',
      email: '  ALICE@EXAMPLE.COM ',
      fullName: 'Alice Example',
      avatarUrl: 'https://example.com/alice.png',
      banned: true,
    });

    expect(canonical.payload).toEqual({
      ytId: 'yt-1',
      email: 'alice@example.com',
      name: 'Alice Example',
      avatarUrl: 'https://example.com/alice.png',
      isBlocked: true,
      migratedFrom: 'youtrack',
    });
    expect(canonical.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies ytId, normalized email, name, blocked state, and target identity', async () => {
    const api = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'target-1',
        ytId: 'yt-1',
        email: 'ALICE@example.com',
        name: 'Alice Example',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
      }),
    } as unknown as OurApiClient;

    await expect(
      verifyMigratedUser(api, 'target-1', {
        ytId: 'yt-1',
        email: 'alice@example.com',
        name: 'Alice Example',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
      }),
    ).resolves.toBeUndefined();
    expect(api.findUserByEmail).toHaveBeenCalledWith('alice@example.com');
  });

  it('rejects any user target mismatch as a verification mismatch', async () => {
    const api = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'wrong-target',
        ytId: 'yt-1',
        email: 'alice@example.com',
        name: 'Alice Example',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
      }),
    } as unknown as OurApiClient;

    await expect(
      verifyMigratedUser(api, 'target-1', {
        ytId: 'yt-1',
        email: 'alice@example.com',
        name: 'Alice Example',
        avatarUrl: null,
        isBlocked: true,
        migratedFrom: 'youtrack',
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_VERIFICATION_MISMATCH' });
  });

  it('preserves the user ID map when a verified manifest row skips loading', async () => {
    const command = new MigrateCommand();
    const idMap = new IdMapService();
    const user = {
      id: 'yt-1',
      login: 'alice',
      email: 'alice@example.com',
      fullName: 'Alice Example',
      banned: false,
    };
    const canonical = canonicalMigratedUser(user);
    const api = {
      discoverEntities: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'entity-1',
            runId: 'run-1',
            entityType: 'user',
            sourceId: user.id,
            sourceChecksum: canonical.checksum,
            targetId: 'target-1',
            status: 'VERIFIED',
          },
        ],
      }),
      transitionEntity: vi.fn(),
      createMigratedUser: vi.fn(),
      findUserByEmail: vi.fn(),
    };
    const usersExtractor = {
      extract: async function* () {
        yield [user];
      },
    };
    const checkpointService = {
      updateProgress: vi.fn(
        async (
          checkpoint: { progress: { users: Record<string, unknown> } },
          _phase: string,
          _project: null,
          update: Record<string, unknown>,
        ) => Object.assign(checkpoint.progress.users, update),
      ),
      save: vi.fn(),
    };
    const reporter = { log: vi.fn(), done: vi.fn() };
    Reflect.set(command, 'api', api);
    Reflect.set(command, 'idMap', idMap);
    Reflect.set(command, 'usersExtractor', usersExtractor);
    Reflect.set(command, 'checkpointService', checkpointService);
    Reflect.set(command, 'reporter', reporter);
    Reflect.set(command, 'userTransformer', new UserTransformer());
    const migrationCheckpoint = {
      version: '0.2.0',
      runId: 'run-1',
      configHash: 'a'.repeat(64),
      startedAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
      config: {},
      status: 'RUNNING',
      idMap: {},
      progress: {
        users: {
          status: 'FAILED',
          total: 7,
          completed: 7,
          lastPage: 0,
          lastId: null,
        },
      },
      errors: [
        {
          phase: 'users',
          entityId: 'yt-1',
          message: 'old failure',
          timestamp: '2026-07-14T00:00:00.000Z',
        },
      ],
    };

    await Reflect.apply(Reflect.get(command, 'migrateUsers'), command, [
      migrationCheckpoint,
      options(),
      'run-1',
    ]);

    expect(idMap.getUserId('yt-1')).toBe('target-1');
    expect(api.createMigratedUser).not.toHaveBeenCalled();
    expect(api.findUserByEmail).not.toHaveBeenCalled();
    expect(migrationCheckpoint.errors).toEqual([]);
    expect(migrationCheckpoint.progress.users).toMatchObject({
      status: 'COMPLETED',
      completed: 1,
      total: 1,
    });
  });
});

function stubLegacyPhases(): void {
  const prototype = Object.getPrototypeOf(new MigrateCommand());
  for (const method of [
    'migrateUsers',
    'ensureFallbackUser',
    'migrateProject',
    'migrateIssues',
    'linkParentIssues',
    'migrateLinks',
    'migrateTags',
    'migrateComments',
    'migrateHistory',
    'restoreTimestamps',
  ]) {
    vi.spyOn(prototype, method).mockResolvedValue(undefined);
  }
}

function completedManifest() {
  return {
    data: {
      id: 'run-1',
      status: 'COMPLETED',
    },
    counts: { VERIFIED: 1 },
  } as never;
}

function incompleteError(): AxiosError {
  const config: InternalAxiosRequestConfig = {
    method: 'post',
    url: '/admin/migration/runs/run-1/complete',
    headers: new AxiosHeaders(),
  };
  return new AxiosError('incomplete', 'ERR_BAD_REQUEST', config, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers: new AxiosHeaders(),
    config,
    data: {
      error: {
        code: 'MIGRATION_RUN_INCOMPLETE',
        message: 'Migration run contains nonterminal entities',
      },
    },
  });
}

function authenticationError(): AxiosError {
  const config: InternalAxiosRequestConfig = {
    method: 'post',
    url: '/admin/migration/users',
    headers: new AxiosHeaders({ Authorization: 'Bearer target-secret' }),
  };
  return new AxiosError('unauthorized', 'UNAUTHORIZED', config, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: new AxiosHeaders(),
    config,
    data: {
      error: {
        code: 'UNAUTHORIZED',
        message: 'sensitive-response-body-must-not-be-logged',
      },
    },
  });
}

describe('terminal migration interruption', () => {
  it('reports a sanitized run-level authentication blocker and stops without completion', async () => {
    const fatal = authenticationError();
    const exit = new Error('process exited');
    stubLegacyPhases();
    const prototype = Object.getPrototypeOf(new MigrateCommand());
    vi.spyOn(prototype, 'migrateUsers').mockRejectedValue(fatal);
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    const save = vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    const complete = vi.spyOn(OurApiClient.prototype, 'completeMigrationRun');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exit;
    });

    await expect(new MigrateCommand().run(options())).rejects.toBe(exit);

    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'INTERRUPTED', runId: 'run-1' }),
    );
    expect(complete).not.toHaveBeenCalled();
    const terminalOutput = output.mock.calls.flat().join(' ');
    expect(terminalOutput).toContain('Migration blocked by authentication (HTTP 401)');
    expect(terminalOutput).not.toContain('sensitive-response-body-must-not-be-logged');
    expect(terminalOutput).not.toContain('target-secret');
  });
});

describe('manifest completion and reindex gate', () => {
  it('completes the manifest before queuing reindex and reports the returned counts', async () => {
    const events: string[] = [];
    stubLegacyPhases();
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    vi.spyOn(CheckpointService.prototype, 'markCompleted').mockResolvedValue(undefined);
    vi.spyOn(OurApiClient.prototype, 'completeMigrationRun').mockImplementation(async () => {
      events.push('complete');
      return completedManifest();
    });
    vi.spyOn(OurApiClient.prototype, 'reindexProject').mockImplementation(async () => {
      events.push('reindex');
    });
    const summary = vi
      .spyOn(SummaryReporter.prototype, 'printSummary')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await new MigrateCommand().run(options());

    expect(events).toEqual(['complete', 'reindex']);
    expect(summary).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1' }),
      expect.any(Number),
      completedManifest(),
    );
  });

  it('reports manifest counts and exits nonzero without reindex when completion is incomplete', async () => {
    stubLegacyPhases();
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    vi.spyOn(OurApiClient.prototype, 'completeMigrationRun').mockRejectedValue(incompleteError());
    const counts = completedManifest();
    vi.spyOn(OurApiClient.prototype, 'getMigrationRun').mockResolvedValue(counts);
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject');
    const summary = vi
      .spyOn(SummaryReporter.prototype, 'printSummary')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;

    await new MigrateCommand().run(options());

    expect(process.exitCode).toBe(1);
    expect(reindex).not.toHaveBeenCalled();
    expect(summary).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
      expect.any(Number),
      counts,
    );
    process.exitCode = previousExitCode;
  });

  it('does not complete the manifest or reindex when a legacy project phase recorded a failure', async () => {
    stubLegacyPhases();
    const prototype = Object.getPrototypeOf(new MigrateCommand());
    vi.spyOn(prototype, 'migrateProject').mockImplementation(async (...args: unknown[]) => {
      const checkpoint = args[1] as MigrationCheckpoint;
      checkpoint.errors.push({
        phase: 'projects',
        entityId: 'APP',
        message: 'failed',
        timestamp: '2026-07-14T00:00:00.000Z',
      });
    });
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    const complete = vi.spyOn(OurApiClient.prototype, 'completeMigrationRun');
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject');
    vi.spyOn(OurApiClient.prototype, 'getMigrationRun').mockResolvedValue(completedManifest());
    vi.spyOn(SummaryReporter.prototype, 'printSummary').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;

    await new MigrateCommand().run(options());

    expect(process.exitCode).toBe(1);
    expect(complete).not.toHaveBeenCalled();
    expect(reindex).not.toHaveBeenCalled();
    process.exitCode = previousExitCode;
  });

  it('keeps the checkpoint failed and exits nonzero when reindexing fails', async () => {
    stubLegacyPhases();
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    const markCompleted = vi.spyOn(CheckpointService.prototype, 'markCompleted');
    vi.spyOn(OurApiClient.prototype, 'completeMigrationRun').mockResolvedValue(completedManifest());
    vi.spyOn(OurApiClient.prototype, 'reindexProject').mockRejectedValue(
      new Error('queue unavailable'),
    );
    const summary = vi
      .spyOn(SummaryReporter.prototype, 'printSummary')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const previousExitCode = process.exitCode;

    await new MigrateCommand().run(options());

    expect(process.exitCode).toBe(1);
    expect(markCompleted).not.toHaveBeenCalled();
    expect(summary).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
      expect.any(Number),
      completedManifest(),
    );
    process.exitCode = previousExitCode;
  });

  it('retries reindex on resume after clearing the prior reindex attempt error', async () => {
    stubLegacyPhases();
    const phase = {
      status: 'COMPLETED' as const,
      total: 1,
      completed: 1,
      lastPage: 0,
      lastId: null,
    };
    vi.spyOn(CheckpointService.prototype, 'load').mockResolvedValue({
      version: '0.2.0',
      runId: 'run-1',
      configHash: 'a'.repeat(64),
      startedAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
      config: {} as MigrationCheckpoint['config'],
      status: 'FAILED',
      idMap: {},
      progress: {
        users: phase,
        projects: {},
        issues: {},
        comments: {},
        tags: {},
        attachments: {},
        timeLogs: {},
        boards: {},
        parentLinks: {},
        links: {},
      },
      errors: [
        {
          phase: 'reindex',
          entityId: 'APP',
          message: 'old queue failure',
          timestamp: '2026-07-14T00:00:00.000Z',
        },
      ],
    });
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1',
      configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    vi.spyOn(CheckpointService.prototype, 'markCompleted').mockResolvedValue(undefined);
    const complete = vi
      .spyOn(OurApiClient.prototype, 'completeMigrationRun')
      .mockResolvedValue(completedManifest());
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject').mockResolvedValue(undefined);
    vi.spyOn(SummaryReporter.prototype, 'printSummary').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await new MigrateCommand().run(options({ resume: true }));

    expect(complete).toHaveBeenCalledWith('run-1');
    expect(reindex).toHaveBeenCalledWith('APP');
  });
});
