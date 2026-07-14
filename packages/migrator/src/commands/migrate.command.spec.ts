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
import { OurApiClient } from '../loaders/api-client';

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
});
