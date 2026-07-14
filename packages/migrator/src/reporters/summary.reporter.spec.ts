import { afterEach, describe, expect, it, vi } from 'vitest';
import { MigrationCheckpoint, createPhaseProgress } from '../checkpoint/checkpoint.types';
import { SummaryReporter } from './summary.reporter';

function checkpoint(): MigrationCheckpoint {
  return {
    version: '0.2.0',
    runId: 'run-1',
    configHash: 'a'.repeat(64),
    startedAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    config: {} as MigrationCheckpoint['config'],
    status: 'COMPLETED',
    idMap: {},
    progress: {
      users: { ...createPhaseProgress(), completed: 4 },
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
    errors: [],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('SummaryReporter', () => {
  it('prints run identity, manifest status counts, and labels checkpoint counters legacy', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    new SummaryReporter().printSummary(checkpoint(), Date.now(), {
      data: {} as never,
      counts: { VERIFIED: 3, FAILED: 1, DISCOVERED: 2 },
    });

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Run ID:');
    expect(output).toContain('run-1');
    expect(output).toContain('Manifest status:');
    expect(output).toContain('VERIFIED');
    expect(output).toContain('3');
    expect(output).toContain('FAILED');
    expect(output).toContain('1');
    expect(output).toContain('Legacy checkpoint progress:');
    expect(output).not.toContain('Users: 4 migrated');
  });
});
