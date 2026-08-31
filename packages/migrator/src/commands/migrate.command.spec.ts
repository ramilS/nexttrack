import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  MigrateCommand,
  MigrateOptions,
  registerStatusMap,
  registerCustomFieldMap,
} from './migrate.command';
import { IdMapService } from '../id-map/id-map.service';
import {
  CheckpointService,
  checkpointProjectKey,
  normalizeCheckpointProgressKeys,
} from '../checkpoint/checkpoint.service';
import { MigrationRunCoordinator } from '../manifest/migration-run.coordinator';
import { ProjectsExtractor } from '../extractors/projects.extractor';
import { UsersExtractor } from '../extractors/users.extractor';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { OurApiClient } from '../loaders/api-client';
import {
  MigrationCheckpoint,
  createPhaseProgress,
} from '../checkpoint/checkpoint.types';
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

it('uses stable collision-resistant safe checkpoint keys for secret-shaped projects', () => {
  const first = checkpointProjectKey('access_token=first-secret-value');
  const second = checkpointProjectKey('access_token=second-secret-value');

  expect(first).not.toBe(second);
  expect(first).not.toContain('first-secret-value');
  expect(second).not.toContain('second-secret-value');
  expect(checkpointProjectKey('APP')).toBe('APP');
  expect(checkpointProjectKey('access_token=first-secret-value')).toBe(first);
});

it('matches stable unsafe project keys when evaluating and repairing phase failures', () => {
  const command = new MigrateCommand();
  const rawProject = 'access_token=first-secret-value';
  const safeProject = checkpointProjectKey(rawProject);
  const failed = {
    status: 'FAILED' as const, total: 1, completed: 0,
    lastPage: 0, lastId: null,
  };
  const checkpoint = {
    progress: { issues: { [safeProject]: failed } },
    errors: [{
      phase: 'issues', projectKey: safeProject, entityId: '2-1',
      message: 'failed', timestamp: '2026-07-14T00:00:00.000Z',
    }],
  } as unknown as MigrationCheckpoint;

  expect(Reflect.apply(Reflect.get(command, 'phaseStatus'), command, [
    checkpoint, 'issues', rawProject,
  ])).toBe('FAILED');
  Reflect.apply(Reflect.get(command, 'prepareLegacyPhaseAttempt'), command, [
    checkpoint, 'issues', [rawProject],
  ]);
  expect(checkpoint.progress.issues[safeProject]).toMatchObject({
    status: 'PENDING', completed: 0,
  });
});

it('migrates legacy raw unsafe progress keys and merges collisions conservatively', () => {
  const rawProject = 'access_token=first-secret-value';
  const safeProject = checkpointProjectKey(rawProject);
  const checkpoint = {
    progress: {
      users: createPhaseProgress(),
      issues: {
        [rawProject]: { ...createPhaseProgress(), status: 'COMPLETED', completed: 5 },
        [safeProject]: { ...createPhaseProgress(), status: 'FAILED', completed: 2 },
      },
    },
    errors: [
      {
        phase: 'issues', projectKey: rawProject, entityId: '2-1',
        message: 'failed', timestamp: '2026-07-14T00:00:00.000Z',
      },
      {
        phase: 'client_secret=phase-secret',
        projectKey: 'refresh_token=project-secret',
        entityId: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
        message: 'Bearer abcdefghijklmnopqrstuvwxyz',
        timestamp: '2026-07-14T00:00:00.000Z',
      },
    ],
  } as unknown as MigrationCheckpoint;

  normalizeCheckpointProgressKeys(checkpoint);

  expect(checkpoint.progress.issues[rawProject]).toBeUndefined();
  expect(checkpoint.progress.issues[safeProject]).toMatchObject({
    status: 'FAILED', completed: 2,
  });
  expect(checkpoint.errors[0]?.projectKey).toBe(safeProject);
  const serialized = JSON.stringify(checkpoint.errors[1]);
  expect(serialized).not.toMatch(/phase-secret|project-secret|abcdefghijklmnopqrstuvwxyz/);
  expect(checkpoint.errors[1]?.phase).toContain('[unknown-');
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
    const save = vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
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

  it('reruns a completed legacy phase that has historical errors and can finish after repair', async () => {
    stubLegacyPhases();
    const prototype = Object.getPrototypeOf(new MigrateCommand());
    const migrateProject = vi
      .spyOn(prototype, 'migrateProject')
      .mockResolvedValue(undefined);
    const completedPhase = {
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
        users: completedPhase,
        projects: { APP: completedPhase },
        issues: {}, comments: {}, tags: {}, attachments: {}, timeLogs: {},
        boards: {}, parentLinks: {}, links: {},
      },
      errors: [{
        phase: 'projects',
        entityId: 'APP',
        message: 'old failure',
        timestamp: '2026-07-14T00:00:00.000Z',
      }],
    });
    vi.spyOn(MigrationRunCoordinator.prototype, 'open').mockResolvedValue({
      runId: 'run-1', configHash: 'a'.repeat(64),
    });
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    vi.spyOn(CheckpointService.prototype, 'markCompleted').mockResolvedValue(undefined);
    const complete = vi.spyOn(OurApiClient.prototype, 'completeMigrationRun')
      .mockResolvedValue(completedManifest());
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject')
      .mockResolvedValue(undefined);
    vi.spyOn(SummaryReporter.prototype, 'printSummary').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await new MigrateCommand().run(options({ resume: true }));

    expect(migrateProject).toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith('run-1');
    expect(reindex).toHaveBeenCalledWith('APP');
  });

  it('resets only projects affected by structured legacy phase errors', () => {
    const command = new MigrateCommand();
    const phase = {
      status: 'COMPLETED' as const, total: 1, completed: 1,
      lastPage: 0, lastId: null,
    };
    const checkpoint = {
      progress: { projects: { APP: { ...phase }, OPS: { ...phase } } },
      errors: [{
        phase: 'projects', projectKey: 'APP', entityId: 'APP',
        message: 'old failure', timestamp: '2026-07-14T00:00:00.000Z',
      }],
    } as unknown as MigrationCheckpoint;

    Reflect.apply(Reflect.get(command, 'prepareLegacyPhaseAttempt'), command, [
      checkpoint, 'projects', ['APP', 'OPS'],
    ]);

    expect(checkpoint.progress.projects.APP).toMatchObject({
      status: 'PENDING', completed: 0,
    });
    expect(checkpoint.progress.projects.OPS).toEqual(phase);
  });
});

describe('true dry run', () => {
  it.each([
    ['history', 'migrateHistory', 'activitiesExtractor', 'getForIssue'],
    ['comments', 'migrateComments', 'commentsExtractor', 'getForIssue'],
    ['attachments', 'migrateAttachments', 'attachmentsExtractor', 'getForIssue'],
    ['timeLogs', 'migrateTimeLogs', 'timeLogsExtractor', 'getForIssue'],
    ['boards', 'migrateBoards', 'boardsExtractor', 'extractForProject'],
  ] as const)(
    'records a dry-run %s source extractor failure in its phase',
    async (phase, method, extractorField, extractorMethod) => {
      const command = new MigrateCommand();
      const migrationOptions = options({ dryRun: true });
      const checkpoint = Reflect.apply(
        Reflect.get(command, 'initDryRunCheckpoint'),
        command,
        [migrationOptions],
      ) as MigrationCheckpoint;
      const issue = {
        id: '2-1', numberInProject: 1, links: [],
        created: 1_700_000_000_000, updated: 1_700_000_001_000,
        resolved: null,
      };
      const extractor = vi.fn().mockRejectedValue(new Error(`${phase} failed`));
      Reflect.set(command, 'idMap', new IdMapService());
      Reflect.set(command, 'issuesExtractor', {
        extract: async function* () {
          yield [issue];
        },
      });
      Reflect.set(command, extractorField, { [extractorMethod]: extractor });
      Reflect.set(command, 'reporter', {
        log: vi.fn(), warn: vi.fn(), info: vi.fn(), done: vi.fn(),
      });
      Reflect.set(command, 'checkpointService', {
        save: vi.fn(),
        updateProgress: vi.fn(async (
          cp: MigrationCheckpoint,
          progressPhase: keyof MigrationCheckpoint['progress'],
          project: string,
          update: Record<string, unknown>,
        ) => {
          const record = cp.progress[progressPhase] as Record<string, unknown>;
          record[checkpointProjectKey(project)] = {
            ...(record[checkpointProjectKey(project)] as object | undefined ??
              createPhaseProgress()),
            ...update,
          };
        }),
      });

      await expect(
        Reflect.apply(Reflect.get(command, method), command, [
          'APP', checkpoint, migrationOptions,
        ]),
      ).resolves.toBeUndefined();

      expect(extractor).toHaveBeenCalled();
      expect(checkpoint.errors).toEqual([
        expect.objectContaining({ phase, projectKey: 'APP' }),
      ]);
    },
  );

  it('records an issue-source extraction failure as the issues phase', async () => {
    const command = new MigrateCommand();
    const migrationOptions = options({ dryRun: true });
    const checkpoint = Reflect.apply(
      Reflect.get(command, 'initDryRunCheckpoint'), command, [migrationOptions],
    ) as MigrationCheckpoint;
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'issuesExtractor', {
      extract: async function* () {
        throw new Error('source unavailable');
      },
    });
    Reflect.set(command, 'reporter', {
      createCounter: () => ({ start: vi.fn(), increment: vi.fn(), stop: vi.fn() }),
      done: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn(),
    });
    Reflect.set(command, 'checkpointService', {
      save: vi.fn(),
      updateProgress: vi.fn(async (
        cp: MigrationCheckpoint,
        phase: keyof MigrationCheckpoint['progress'],
        project: string,
        update: Record<string, unknown>,
      ) => {
        const record = cp.progress[phase] as Record<string, unknown>;
        record[checkpointProjectKey(project)] = {
          ...createPhaseProgress(), ...update,
        };
      }),
    });

    await Reflect.apply(Reflect.get(command, 'migrateIssues'), command, [
      'APP', checkpoint, migrationOptions,
    ]);

    expect(checkpoint.errors).toEqual([
      expect.objectContaining({ phase: 'issues', projectKey: 'APP' }),
    ]);
    expect(checkpoint.progress.issues.APP).toMatchObject({ status: 'FAILED' });
  });

  it('records a replayed issue-source extraction failure in the dependent phase', async () => {
    const command = new MigrateCommand();
    const migrationOptions = options({ dryRun: true });
    const checkpoint = Reflect.apply(
      Reflect.get(command, 'initDryRunCheckpoint'), command, [migrationOptions],
    ) as MigrationCheckpoint;
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'issuesExtractor', {
      extract: async function* () {
        throw new Error('source unavailable');
      },
    });
    Reflect.set(command, 'reporter', { warn: vi.fn(), info: vi.fn(), log: vi.fn(), done: vi.fn() });
    Reflect.set(command, 'checkpointService', { save: vi.fn() });

    await Reflect.apply(Reflect.get(command, 'migrateHistory'), command, [
      'APP', checkpoint, migrationOptions,
    ]);

    expect(checkpoint.errors).toEqual([
      expect.objectContaining({ phase: 'history', projectKey: 'APP' }),
    ]);
  });

  it('rejects an unsafe project key before logging or opening a coordinator', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const open = vi.spyOn(MigrationRunCoordinator.prototype, 'open');

    await expect(
      new MigrateCommand().run(
        options({ projects: ['access_token=abcdefghijklmnopqrstuvwxyz'] }),
      ),
    ).rejects.toThrow('Migration project keys are invalid');

    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain(
      'abcdefghijklmnopqrstuvwxyz',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('transforms source users without any target or manifest mutation or server run id', async () => {
    const transform = vi.spyOn(UserTransformer.prototype, 'transform');
    vi.spyOn(UsersExtractor.prototype, 'extract').mockImplementation(async function* () {
      yield [{
        id: 'yt-1', login: 'alice', email: 'ALICE@example.com',
        fullName: 'Alice', banned: false,
      }] as never;
    });
    const save = vi
      .spyOn(CheckpointService.prototype, 'save')
      .mockResolvedValue(undefined);
    vi.spyOn(CheckpointService.prototype, 'markCompleted').mockResolvedValue(undefined);
    vi.spyOn(SummaryReporter.prototype, 'printSummary').mockImplementation(() => undefined);
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const mutations = [
      vi.spyOn(OurApiClient.prototype, 'startMigrationRun'),
      vi.spyOn(OurApiClient.prototype, 'getMigrationRun'),
      vi.spyOn(OurApiClient.prototype, 'discoverEntities'),
      vi.spyOn(OurApiClient.prototype, 'transitionEntity'),
      vi.spyOn(OurApiClient.prototype, 'createMigratedUser'),
      vi.spyOn(OurApiClient.prototype, 'completeMigrationRun'),
      vi.spyOn(OurApiClient.prototype, 'reindexProject'),
    ];

    await new MigrateCommand().run(options({ dryRun: true, projects: [] }));

    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
    for (const [checkpoint] of save.mock.calls) {
      expect(checkpoint.runId).toBeUndefined();
    }
    const text = output.mock.calls.flat().join(' ');
    expect(text).toContain('[DRY] Users: 1 extracted and transformed; none written');
    expect(text).not.toContain('Migration run ID:');
    expect(transform).toHaveBeenCalledOnce();
  });

  it('runs the issue transformer during dry-run validation', async () => {
    const command = new MigrateCommand();
    const transform = vi.fn().mockReturnValue({ title: 'validated' });
    const counter = { start: vi.fn(), increment: vi.fn(), stop: vi.fn() };
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'issueTransformer', { transform });
    Reflect.set(command, 'issuesExtractor', {
      extract: async function* () { yield [{ id: 'yt-issue-1', numberInProject: 1 }]; },
    });
    Reflect.set(command, 'checkpointService', {
      updateProgress: vi.fn(async (
        checkpoint: MigrationCheckpoint,
        _phase: string,
        project: string,
        update: Record<string, unknown>,
      ) => {
        checkpoint.progress.issues[project] = {
          ...(checkpoint.progress.issues[project] ?? {
            status: 'PENDING', total: null, completed: 0, lastPage: 0, lastId: null,
          }),
          ...update,
        } as never;
      }),
      save: vi.fn(),
    });
    Reflect.set(command, 'reporter', {
      createCounter: vi.fn(() => counter), log: vi.fn(), done: vi.fn(), warn: vi.fn(),
    });
    const checkpoint = {
      progress: { issues: {} }, errors: [], idMap: {},
    } as unknown as MigrationCheckpoint;

    await Reflect.apply(Reflect.get(command, 'migrateIssues'), command, [
      'APP', checkpoint, options({ dryRun: true }),
    ]);

    expect(transform).toHaveBeenCalledOnce();
    expect(counter.increment).toHaveBeenCalledOnce();
  });

  it('records a missing requested project as a failed dry-run validation', async () => {
    const command = new MigrateCommand();
    const checkpoint = {
      progress: { projects: {} }, errors: [], idMap: {},
    } as unknown as MigrationCheckpoint;
    Reflect.set(command, 'projectsExtractor', {
      extractProjects: vi.fn().mockResolvedValue([]),
    });
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'reporter', { warn: vi.fn(), done: vi.fn() });
    Reflect.set(command, 'checkpointService', {
      save: vi.fn(),
      updateProgress: vi.fn(async (
        cp: MigrationCheckpoint,
        _phase: string,
        project: string,
        update: Record<string, unknown>,
      ) => {
        cp.progress.projects[project] = {
          ...(cp.progress.projects[project] ?? {
            status: 'PENDING', total: null, completed: 0, lastPage: 0, lastId: null,
          }),
          ...update,
        } as never;
      }),
    });

    await Reflect.apply(Reflect.get(command, 'migrateProject'), command, [
      'MISSING', checkpoint, options({ dryRun: true }),
    ]);

    expect(checkpoint.errors).toEqual([
      expect.objectContaining({ phase: 'projects', projectKey: 'MISSING' }),
    ]);
    expect(checkpoint.progress.projects.MISSING?.status).toBe('FAILED');
  });

  it('validates a source project on a clean target without reading target maps', async () => {
    const command = new MigrateCommand();
    const checkpoint = {
      progress: { projects: {} }, errors: [], idMap: {},
    } as unknown as MigrationCheckpoint;
    const getStatusMap = vi.spyOn(OurApiClient.prototype, 'getStatusMap');
    const getCustomFieldMap = vi.spyOn(OurApiClient.prototype, 'getCustomFieldMap');
    Reflect.set(command, 'projectsExtractor', {
      extractProjects: vi.fn().mockResolvedValue([{ id: 'yt-project', name: 'App' }]),
      getStates: vi.fn().mockResolvedValue([{ name: 'Open' }]),
    });
    Reflect.set(command, 'fieldDefsExtractor', {
      collect: vi.fn().mockResolvedValue([
        { name: 'Environment', ytType: 'SingleEnumIssueCustomField', optionNames: ['Prod'] },
      ]),
    });
    Reflect.set(command, 'teamExtractor', { getUserRoles: vi.fn().mockResolvedValue(new Map()) });
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'reporter', { log: vi.fn(), info: vi.fn(), warn: vi.fn(), done: vi.fn() });
    Reflect.set(command, 'checkpointService', {
      save: vi.fn(),
      updateProgress: vi.fn(async (
        cp: MigrationCheckpoint,
        _phase: string,
        project: string,
        update: Record<string, unknown>,
      ) => {
        cp.progress.projects[project] = {
          ...(cp.progress.projects[project] ?? createPhaseProgress()), ...update,
        } as never;
      }),
    });

    await Reflect.apply(Reflect.get(command, 'migrateProject'), command, [
      'APP', checkpoint, options({ dryRun: true }),
    ]);

    expect(getStatusMap).not.toHaveBeenCalled();
    expect(getCustomFieldMap).not.toHaveBeenCalled();
    expect(checkpoint.errors).toHaveLength(0);
    expect(checkpoint.progress.projects.APP?.status).toBe('COMPLETED');
    const idMap = Reflect.get(command, 'idMap') as IdMapService;
    expect(idMap.getStatusId('APP', 'Open')).toMatch(/^[0-9a-f-]{36}$/);
    expect(idMap.getCustomFieldId('Environment')).toMatch(/^[0-9a-f-]{36}$/);
    expect(idMap.getEnumOptionId('Environment', 'Prod')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exits nonzero when a real dry-run command cannot find a requested project', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(UsersExtractor.prototype, 'extract').mockImplementation(async function* () {});
    vi.spyOn(ProjectsExtractor.prototype, 'extractProjects').mockResolvedValue([]);
    vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    vi.spyOn(SummaryReporter.prototype, 'printSummary').mockImplementation(() => undefined);
    const commandPrototype = MigrateCommand.prototype as unknown as Record<
      string,
      (...args: unknown[]) => Promise<void>
    >;
    for (const phase of [
      'migrateIssues', 'linkParentIssues', 'migrateLinks', 'migrateTags',
      'migrateComments', 'migrateHistory', 'restoreTimestamps',
    ]) {
      vi.spyOn(commandPrototype, phase).mockResolvedValue(undefined);
    }
    const complete = vi.spyOn(OurApiClient.prototype, 'completeMigrationRun');
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject');

    await new MigrateCommand().run(
      options({ dryRun: true, projects: ['MISSING'] }),
    );

    expect(process.exitCode).toBe(1);
    expect(complete).not.toHaveBeenCalled();
    expect(reindex).not.toHaveBeenCalled();
    process.exitCode = previousExitCode;
  });

  it('redacts credential values before checkpoint persistence and warning logs', async () => {
    const command = new MigrateCommand();
    const save = vi.fn();
    const warn = vi.fn();
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'checkpointService', { save });
    Reflect.set(command, 'reporter', { warn });
    const checkpoint = {
      errors: [], idMap: {},
    } as unknown as MigrationCheckpoint;

    await Reflect.apply(Reflect.get(command, 'recordError'), command, [
      checkpoint,
      'issues',
      '2-42',
      new Error('POST /issues: Bearer abcdefghijklmnopqrstuvwxyz'),
      'APP',
    ]);

    expect(checkpoint.errors[0]?.message).toBe(
      'POST /issues: Bearer [redacted]',
    );
    expect(warn).toHaveBeenCalledWith(
      'Error [issues] 2-42: POST /issues: Bearer [redacted]',
    );
    expect(JSON.stringify(save.mock.calls)).not.toContain(
      'abcdefghijklmnopqrstuvwxyz',
    );
  });

  it('persists and summarizes a thrown dry-run extraction failure with nonzero exit', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(UsersExtractor.prototype, 'extract').mockImplementation(async function* () {
      throw new Error(
        'source read failed: sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
      );
    });
    const save = vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    const summary = vi
      .spyOn(SummaryReporter.prototype, 'printSummary')
      .mockImplementation(() => undefined);
    const complete = vi.spyOn(OurApiClient.prototype, 'completeMigrationRun');
    const reindex = vi.spyOn(OurApiClient.prototype, 'reindexProject');
    const start = vi.spyOn(OurApiClient.prototype, 'startMigrationRun');

    await new MigrateCommand().run(options({ dryRun: true, projects: [] }));

    expect(process.exitCode).toBe(1);
    const persisted = save.mock.calls.at(-1)?.[0];
    expect(persisted?.status).toBe('FAILED');
    expect(persisted?.errors.at(-1)?.message).toBe(
      'source read failed: [redacted]',
    );
    expect(summary).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(reindex).not.toHaveBeenCalled();
    process.exitCode = previousExitCode;
  });

  it('sanitizes the fallback-user failure warning', async () => {
    const command = new MigrateCommand();
    const warn = vi.fn();
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'api', {
      createMigratedUser: vi.fn().mockRejectedValue(
        new Error('Bearer abcdefghijklmnopqrstuvwxyz'),
      ),
    });
    Reflect.set(command, 'reporter', { warn });

    await Reflect.apply(Reflect.get(command, 'ensureFallbackUser'), command, [
      options(),
    ]);

    expect(warn).toHaveBeenCalledWith(
      'Could not create the migration ghost user: Bearer [redacted]. ' +
        'Issues from deleted YouTrack accounts will fail to migrate.',
    );
  });

  it('persists a failed local checkpoint when all-project discovery throws', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(ProjectsExtractor.prototype, 'extractProjects').mockRejectedValue(
      new Error('discovery failed: client_secret=abcdefghijklmnopqrstuvwxyz'),
    );
    const save = vi.spyOn(CheckpointService.prototype, 'save').mockResolvedValue(undefined);
    const summary = vi
      .spyOn(SummaryReporter.prototype, 'printSummary')
      .mockImplementation(() => undefined);
    const start = vi.spyOn(OurApiClient.prototype, 'startMigrationRun');

    await new MigrateCommand().run(
      options({ dryRun: true, allProjects: true, projects: [] }),
    );

    expect(process.exitCode).toBe(1);
    expect(save.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 'FAILED',
      errors: [expect.objectContaining({ message: expect.stringContaining('[redacted]') })],
    });
    expect(summary).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    process.exitCode = previousExitCode;
  });

  it('sanitizes checkpoint and log metadata fields', async () => {
    const command = new MigrateCommand();
    const warn = vi.fn();
    const save = vi.fn();
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'reporter', { warn });
    Reflect.set(command, 'checkpointService', { save });
    const checkpoint = { errors: [], idMap: {} } as unknown as MigrationCheckpoint;

    await Reflect.apply(Reflect.get(command, 'recordError'), command, [
      checkpoint,
      'attachments',
      'file-access_token=abcdefghijklmnopqrstuvwxyz',
      new Error('download failed'),
      'client_secret=abcdefghijklmnopqrstuvwxyz',
    ]);

    const serialized = JSON.stringify({ checkpoint, calls: warn.mock.calls });
    expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(serialized).toContain('[redacted]');
  });

  it('sanitizes a missing source project key before warning', async () => {
    const command = new MigrateCommand();
    const warn = vi.fn();
    Reflect.set(command, 'projectsExtractor', {
      extractProjects: vi.fn().mockResolvedValue([]),
    });
    Reflect.set(command, 'idMap', new IdMapService());
    Reflect.set(command, 'reporter', { warn });
    Reflect.set(command, 'checkpointService', {
      save: vi.fn(),
      updateProgress: vi.fn(),
    });
    const checkpoint = {
      progress: { projects: {} }, errors: [], idMap: {},
    } as unknown as MigrationCheckpoint;

    await Reflect.apply(Reflect.get(command, 'migrateProject'), command, [
      'access_token=abcdefghijklmnopqrstuvwxyz',
      checkpoint,
      options({ dryRun: true }),
    ]);

    expect(JSON.stringify(warn.mock.calls)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(warn.mock.calls)).toContain('[redacted]');
  });
});

describe('board phase resume safety', () => {
  function buildBoardsCommand(overrides: {
    createBoard: ReturnType<typeof vi.fn>;
    createSprint: ReturnType<typeof vi.fn>;
    addSprintIssues: ReturnType<typeof vi.fn>;
    setSprintStatus: ReturnType<typeof vi.fn>;
  }) {
    const command = new MigrateCommand();
    const idMap = new IdMapService();
    idMap.registerIssue('yt-issue-1', 'target-issue-1');

    Reflect.set(command, 'idMap', idMap);
    Reflect.set(command, 'boardsExtractor', {
      extractForProject: vi.fn().mockResolvedValue([
        {
          id: 'agile-1',
          name: 'The Office',
          sprints: [
            { id: 'sprint-1', name: 'Sprint 1', archived: true, finish: 1_700_000_000_000, issues: [{ id: 'yt-issue-1' }] },
          ],
        },
      ]),
    });
    Reflect.set(command, 'api', {
      setBoardColumns: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    });
    Reflect.set(command, 'reporter', {
      log: vi.fn(), warn: vi.fn(), info: vi.fn(), done: vi.fn(),
    });
    Reflect.set(command, 'checkpointService', {
      save: vi.fn(),
      updateProgress: vi.fn().mockResolvedValue(undefined),
    });

    return command;
  }

  const checkpoint = () =>
    ({
      progress: { boards: {} },
      errors: [],
    }) as unknown as MigrationCheckpoint;

  it('skips issue and status writes for a sprint a previous attempt created', async () => {
    const addSprintIssues = vi.fn().mockResolvedValue(undefined);
    const setSprintStatus = vi.fn().mockResolvedValue(undefined);
    const command = buildBoardsCommand({
      createBoard: vi.fn().mockResolvedValue({ id: 'board-1', existed: true }),
      createSprint: vi.fn().mockResolvedValue({ id: 'sprint-1', existed: true }),
      addSprintIssues,
      setSprintStatus,
    });

    await Reflect.apply(Reflect.get(command, 'migrateBoards'), command, [
      'APP', checkpoint(), options({ withBoards: true }),
    ]);

    // Re-adding issues to an already-CLOSED sprint is rejected outright, so a
    // resumed run must leave a finished sprint untouched.
    expect(addSprintIssues).not.toHaveBeenCalled();
    expect(setSprintStatus).not.toHaveBeenCalled();
  });

  it('still populates a sprint it created in this run', async () => {
    const addSprintIssues = vi.fn().mockResolvedValue(undefined);
    const setSprintStatus = vi.fn().mockResolvedValue(undefined);
    const command = buildBoardsCommand({
      createBoard: vi.fn().mockResolvedValue({ id: 'board-1', existed: false }),
      createSprint: vi.fn().mockResolvedValue({ id: 'sprint-1', existed: false }),
      addSprintIssues,
      setSprintStatus,
    });

    await Reflect.apply(Reflect.get(command, 'migrateBoards'), command, [
      'APP', checkpoint(), options({ withBoards: true }),
    ]);

    expect(addSprintIssues).toHaveBeenCalledWith('board-1', 'sprint-1', [
      'target-issue-1',
    ]);
    expect(setSprintStatus).toHaveBeenCalledWith(
      'board-1',
      'sprint-1',
      expect.objectContaining({ status: 'CLOSED' }),
    );
  });
});
