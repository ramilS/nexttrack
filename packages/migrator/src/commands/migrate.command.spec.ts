import { describe, it, expect, vi } from 'vitest';
import {
  MigrateCommand,
  MigrateOptions,
  unsupportedMigrationFlags,
  registerStatusMap,
  registerCustomFieldMap,
} from './migrate.command';
import { IdMapService } from '../id-map/id-map.service';

const baseOptions: MigrateOptions = {
  sourceUrl: 'https://yt.example.com',
  sourceToken: 'perm:x',
  targetUrl: 'http://localhost:3001',
  targetToken: 'jwt',
  migrationSecret: 'x'.repeat(32),
  projects: ['DEVX'],
  allProjects: false,
  withAttachments: false,
  withTimeTracking: false,
  withBoards: false,
  withClosedIssues: false,
  dryRun: false,
  resume: false,
  checkpointFile: './cp.json',
  concurrency: 3,
  batchSize: 50,
  rateLimit: 10,
  verbose: false,
};

describe('MigrateCommand unsupported-flag guard', () => {
  it('aborts with exit code 1 before doing any work when --with-boards is set', async () => {
    const command = new MigrateCommand();
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: string | number | null): never => {
        throw new Error(`exit:${code}`);
      }));

    try {
      await expect(
        command.run({ ...baseOptions, withBoards: true }),
      ).rejects.toThrow('exit:1');
    } finally {
      exit.mockRestore();
    }
  });
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

describe('unsupportedMigrationFlags', () => {
  it('flags --with-boards (loading not yet implemented)', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: true, withTimeTracking: false }),
    ).toEqual(['--with-boards']);
  });

  it('does NOT flag --with-time-tracking (now supported)', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: false, withTimeTracking: true }),
    ).toEqual([]);
  });

  it('returns empty when neither is set', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: false, withTimeTracking: false }),
    ).toEqual([]);
  });
});
