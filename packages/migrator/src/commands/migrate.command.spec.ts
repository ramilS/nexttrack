import { describe, it, expect, vi } from 'vitest';
import { MigrateCommand, MigrateOptions, unsupportedMigrationFlags } from './migrate.command';

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

describe('unsupportedMigrationFlags', () => {
  it('flags both --with-boards and --with-time-tracking when set', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: true, withTimeTracking: true }),
    ).toEqual(['--with-boards', '--with-time-tracking']);
  });

  it('returns empty when neither is set', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: false, withTimeTracking: false }),
    ).toEqual([]);
  });

  it('flags only the flag that is set', () => {
    expect(
      unsupportedMigrationFlags({ withBoards: false, withTimeTracking: true }),
    ).toEqual(['--with-time-tracking']);
  });
});
