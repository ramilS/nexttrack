import {
  MigrationEntityStatus,
  MigrationRunStatus,
  type MigrationEntity,
  type MigrationRun,
} from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type { MigrationManifestStore } from './migration-manifest.repository';
import { MigrationManifestService } from './migration-manifest.service';
import { canonicalJsonChecksum } from './migration-json';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ENTITY_ID = '00000000-0000-4000-8000-000000000002';
const CHECKSUM = 'a'.repeat(64);
const CHANGED_CHECKSUM = 'b'.repeat(64);
function safeConfig() {
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
  };
}
const CONFIG_HASH = canonicalJsonChecksum(safeConfig());
const NOW = new Date('2026-07-14T12:00:00.000Z');

function entity(
  overrides: Partial<MigrationEntity> = {},
): MigrationEntity {
  return {
    id: ENTITY_ID,
    runId: RUN_ID,
    entityType: 'issue',
    sourceId: '2-42',
    sourceChecksum: CHECKSUM,
    targetId: null,
    status: MigrationEntityStatus.DISCOVERED,
    attemptCount: 0,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    discoveredAt: NOW,
    transformedAt: null,
    loadedAt: null,
    verifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function run(overrides: Partial<MigrationRun> = {}): MigrationRun {
  return {
    id: RUN_ID,
    sourceSystem: 'youtrack-cloud',
    sourceTenant: 'example.youtrack.cloud',
    sourceUrl: 'https://example.youtrack.cloud',
    targetUrl: 'http://localhost:3001',
    config: safeConfig(),
    configHash: CHECKSUM,
    specVersion: '2026-07-14',
    exclusionVersion: '2026-07-14',
    fingerprintHash: 'f'.repeat(64),
    status: MigrationRunStatus.RUNNING,
    startedAt: NOW,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function transition(
  overrides: Partial<Parameters<MigrationManifestService['transition']>[1]> = {},
): Parameters<MigrationManifestService['transition']>[1] {
  return {
    entityType: 'issue',
    sourceId: '2-42',
    sourceChecksum: CHECKSUM,
    status: MigrationEntityStatus.TRANSFORMED,
    ...overrides,
  };
}

describe('MigrationManifestService', () => {
  let service: MigrationManifestService;
  let repo: jest.Mocked<MigrationManifestStore>;

  beforeEach(() => {
    repo = {
      createOrReturnActiveRun: jest.fn(),
      findRun: jest.fn(),
      findEntity: jest.fn(),
      discoverMany: jest.fn(),
      updateEntity: jest.fn(),
      updateRunStatus: jest.fn(),
      countNonterminal: jest.fn(),
      completeRun: jest.fn(),
      summarize: jest.fn(),
      listEntities: jest.fn(),
    };
    service = new MigrationManifestService(repo);
  });

  it.each([
    [MigrationEntityStatus.DISCOVERED, MigrationEntityStatus.TRANSFORMED],
    [MigrationEntityStatus.TRANSFORMED, MigrationEntityStatus.LOADED],
    [MigrationEntityStatus.LOADED, MigrationEntityStatus.VERIFIED],
    [MigrationEntityStatus.DISCOVERED, MigrationEntityStatus.FAILED],
    [MigrationEntityStatus.TRANSFORMED, MigrationEntityStatus.FAILED],
    [MigrationEntityStatus.LOADED, MigrationEntityStatus.FAILED],
    [MigrationEntityStatus.FAILED, MigrationEntityStatus.TRANSFORMED],
    [MigrationEntityStatus.DISCOVERED, MigrationEntityStatus.EXCLUDED_APPROVED],
  ])('allows %s -> %s', async (from, to) => {
    const targetId =
      to === MigrationEntityStatus.LOADED ||
      to === MigrationEntityStatus.VERIFIED
        ? 'target-42'
        : undefined;
    const error =
      to === MigrationEntityStatus.FAILED
        ? { code: 'SOURCE_INVALID', message: 'Source entity is invalid' }
        : undefined;
    repo.findEntity.mockResolvedValue(entity({ status: from }));
    repo.updateEntity.mockResolvedValue(entity({ status: to }));

    await expect(
      service.transition(RUN_ID, transition({ status: to, targetId, error })),
    ).resolves.toMatchObject({ status: to });
  });

  it('rejects VERIFIED -> LOADED', async () => {
    repo.findEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.VERIFIED }),
    );

    await expect(
      service.transition(
        RUN_ID,
        transition({ status: MigrationEntityStatus.LOADED, targetId: 'target-42' }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
    });
  });

  it('rejects a transition when the source checksum does not match', async () => {
    repo.findEntity.mockResolvedValue(entity());

    await expect(
      service.transition(RUN_ID, transition({ sourceChecksum: CHANGED_CHECKSUM })),
    ).rejects.toMatchObject({ code: ErrorCode.MIGRATION_CHECKSUM_MISMATCH });
  });

  it('rejects a stale conditional transition write', async () => {
    repo.findEntity.mockResolvedValue(entity());
    repo.updateEntity.mockResolvedValue(null);

    await expect(service.transition(RUN_ID, transition())).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
    });
  });

  it('requires a target ID when entering LOADED', async () => {
    repo.findEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.TRANSFORMED }),
    );

    await expect(
      service.transition(RUN_ID, transition({ status: MigrationEntityStatus.LOADED })),
    ).rejects.toMatchObject({ code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION });
  });

  it('requires a target ID when entering VERIFIED', async () => {
    repo.findEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.LOADED, targetId: 'target-42' }),
    );

    await expect(
      service.transition(
        RUN_ID,
        transition({ status: MigrationEntityStatus.VERIFIED }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION });
    expect(repo.updateEntity).not.toHaveBeenCalled();
  });

  it('requires a structured error when entering FAILED', async () => {
    repo.findEntity.mockResolvedValue(entity());

    await expect(
      service.transition(RUN_ID, transition({ status: MigrationEntityStatus.FAILED })),
    ).rejects.toMatchObject({ code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION });
  });

  it('persists structured failure fields in the entity patch', async () => {
    repo.findEntity.mockResolvedValue(entity());
    repo.updateEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.FAILED }),
    );

    await service.transition(
      RUN_ID,
      transition({
        status: MigrationEntityStatus.FAILED,
        error: {
          code: 'SOURCE_INVALID',
          message:
            'Source entity is invalid: Bearer abcdefghijklmnopqrstuvwxyz',
          details: { field: 'summary' },
        },
      }),
    );

    expect(repo.updateEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ENTITY_ID,
        runId: RUN_ID,
        expectedStatus: MigrationEntityStatus.DISCOVERED,
        expectedChecksum: CHECKSUM,
        patch: expect.objectContaining({
          status: MigrationEntityStatus.FAILED,
          errorCode: 'SOURCE_INVALID',
          errorMessage: 'Source entity is invalid: Bearer [redacted]',
          errorDetails: { field: 'summary' },
        }),
      }),
    );
  });

  it('persists the target ID and loaded timestamp in the entity patch', async () => {
    repo.findEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.TRANSFORMED }),
    );
    repo.updateEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.LOADED, targetId: 'target-42' }),
    );

    await service.transition(
      RUN_ID,
      transition({
        status: MigrationEntityStatus.LOADED,
        targetId: 'target-42',
      }),
    );

    expect(repo.updateEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ENTITY_ID,
        runId: RUN_ID,
        expectedStatus: MigrationEntityStatus.TRANSFORMED,
        expectedChecksum: CHECKSUM,
        patch: expect.objectContaining({
          status: MigrationEntityStatus.LOADED,
          targetId: 'target-42',
          loadedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('increments attempt count when entering TRANSFORMED', async () => {
    repo.findEntity.mockResolvedValue(entity({ attemptCount: 2 }));
    repo.updateEntity.mockResolvedValue(
      entity({ status: MigrationEntityStatus.TRANSFORMED, attemptCount: 3 }),
    );

    await service.transition(RUN_ID, transition());

    expect(repo.updateEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ENTITY_ID,
        expectedStatus: MigrationEntityStatus.DISCOVERED,
        expectedChecksum: CHECKSUM,
        patch: expect.objectContaining({ attemptCount: 3 }),
      }),
    );
  });

  it('retains entity state when discovery finds the same checksum', async () => {
    const verified = entity({
      status: MigrationEntityStatus.VERIFIED,
      targetId: 'target-42',
      verifiedAt: NOW,
    });
    repo.findRun.mockResolvedValue(run());
    repo.discoverMany.mockResolvedValue([verified]);

    await expect(
      service.discover(RUN_ID, [
        { entityType: 'issue', sourceId: '2-42', sourceChecksum: CHECKSUM },
      ]),
    ).resolves.toEqual([verified]);
    expect(repo.discoverMany).toHaveBeenCalledWith(RUN_ID, [
      { entityType: 'issue', sourceId: '2-42', sourceChecksum: CHECKSUM },
    ]);
  });

  it('reopens and clears stale state when discovery finds a changed checksum', async () => {
    const reopened = entity({ sourceChecksum: CHANGED_CHECKSUM });
    repo.discoverMany.mockResolvedValue([reopened]);

    await expect(
      service.discover(RUN_ID, [
        {
          entityType: 'issue',
          sourceId: '2-42',
          sourceChecksum: CHANGED_CHECKSUM,
        },
      ]),
    ).resolves.toEqual([reopened]);
    expect(repo.discoverMany).toHaveBeenCalledWith(RUN_ID, [
      {
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: CHANGED_CHECKSUM,
      },
    ]);
  });

  it('rejects discovery batches above 500 entities', async () => {
    repo.findRun.mockResolvedValue(run());
    const inputs = Array.from({ length: 501 }, (_, index) => ({
      entityType: 'issue',
      sourceId: String(index),
      sourceChecksum: CHECKSUM,
    }));

    await expect(service.discover(RUN_ID, inputs)).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
    });
    expect(repo.discoverMany).not.toHaveBeenCalled();
  });

  it('does not complete a run with nonterminal entities', async () => {
    repo.completeRun.mockResolvedValue({ outcome: 'incomplete' });

    await expect(service.complete(RUN_ID)).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_RUN_INCOMPLETE,
    });
  });

  it('completes a run when every entity is terminal', async () => {
    const completed = run({
      status: MigrationRunStatus.COMPLETED,
      completedAt: NOW,
    });
    const summary = { run: completed, counts: { VERIFIED: 2 } };
    repo.completeRun.mockResolvedValue({ outcome: 'completed', summary });

    await expect(service.complete(RUN_ID)).resolves.toEqual(summary);
    expect(repo.completeRun).toHaveBeenCalledWith(RUN_ID);
  });

  it('computes and stores the canonical server fingerprint', async () => {
    repo.createOrReturnActiveRun.mockResolvedValue(run());

    await service.startRun({
      sourceSystem: 'youtrack-cloud',
      sourceTenant: ' EXAMPLE.youtrack.cloud ',
      sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
      targetUrl: 'http://LOCALHOST:3001/',
      config: safeConfig(),
      configHash: CONFIG_HASH,
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    });

    expect(repo.createOrReturnActiveRun).toHaveBeenCalledWith({
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      config: safeConfig(),
      configHash: CONFIG_HASH,
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
      fingerprintHash:
        '6ad63dbe1c1a95cf1b3539922c7d1b400870695869b644eb423bc6c9211936a3',
    });
  });

  it('rejects run configuration containing secrets', async () => {
    await expect(
      service.startRun({
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: { nested: { sourceToken: 'do-not-store' } },
        configHash: CHECKSUM,
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.MIGRATION_RESUME_CONFIG_MISMATCH });
    expect(repo.createOrReturnActiveRun).not.toHaveBeenCalled();
  });
});
