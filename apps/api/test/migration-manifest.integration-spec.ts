import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
} from './support/create-e2e-app';
import { MigrationEntityStatus, MigrationRunStatus } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import { MigrationManifestService } from '@/modules/migration/migration-manifest.service';

describe('Migration manifest (Integration)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => teardownE2eApp(ctx));
  beforeEach(async () => truncateTables(ctx.prisma));

  it('uniquely identifies a source entity inside a run', async () => {
    const run = await ctx.prisma.migrationRun.create({
      data: {
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: {},
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
      },
    });

    const data = {
      runId: run.id,
      entityType: 'issue',
      sourceId: '2-42',
      sourceChecksum: 'b'.repeat(64),
    };
    await ctx.prisma.migrationEntity.create({ data });
    await expect(
      ctx.prisma.migrationEntity.create({ data }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('atomically reopens a completed run when a checksum changes', async () => {
    const service = ctx.app.get(MigrationManifestService);
    const run = await ctx.prisma.migrationRun.create({
      data: {
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: {},
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
        status: MigrationRunStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await ctx.prisma.migrationEntity.create({
      data: {
        runId: run.id,
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
        targetId: 'target-42',
        status: MigrationEntityStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });

    await service.discover(run.id, [
      {
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'c'.repeat(64),
      },
    ]);

    await expect(ctx.prisma.migrationRun.findUniqueOrThrow({
      where: { id: run.id },
    })).resolves.toMatchObject({
      status: MigrationRunStatus.RUNNING,
      completedAt: null,
    });
    await expect(ctx.prisma.migrationEntity.findFirstOrThrow({
      where: { runId: run.id, sourceId: '2-42' },
    })).resolves.toMatchObject({
      status: MigrationEntityStatus.DISCOVERED,
      sourceChecksum: 'c'.repeat(64),
      targetId: null,
    });
  });

  it('serializes completion with checksum-based reopening', async () => {
    const service = ctx.app.get(MigrationManifestService);
    const run = await ctx.prisma.migrationRun.create({
      data: {
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: {},
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
        status: MigrationRunStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await ctx.prisma.migrationEntity.create({
      data: {
        runId: run.id,
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
        targetId: 'target-42',
        status: MigrationEntityStatus.VERIFIED,
      },
    });

    await Promise.allSettled([
      service.complete(run.id),
      service.discover(run.id, [
        {
          entityType: 'issue',
          sourceId: '2-42',
          sourceChecksum: 'c'.repeat(64),
        },
      ]),
    ]);

    const [storedRun, nonterminal] = await Promise.all([
      ctx.prisma.migrationRun.findUniqueOrThrow({ where: { id: run.id } }),
      ctx.prisma.migrationEntity.count({
        where: {
          runId: run.id,
          status: {
            notIn: [
              MigrationEntityStatus.VERIFIED,
              MigrationEntityStatus.EXCLUDED_APPROVED,
            ],
          },
        },
      }),
    ]);
    expect(
      storedRun.status === MigrationRunStatus.COMPLETED && nonterminal > 0,
    ).toBe(false);
  });

  it('allows only one concurrent transition from the same expected state', async () => {
    const service = ctx.app.get(MigrationManifestService);
    const run = await ctx.prisma.migrationRun.create({
      data: {
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        sourceUrl: 'https://example.youtrack.cloud',
        targetUrl: 'http://localhost:3001',
        config: {},
        configHash: 'a'.repeat(64),
        specVersion: '2026-07-14',
        exclusionVersion: '2026-07-14',
      },
    });
    await ctx.prisma.migrationEntity.create({
      data: {
        runId: run.id,
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
      },
    });
    const input = {
      entityType: 'issue',
      sourceId: '2-42',
      sourceChecksum: 'b'.repeat(64),
      status: MigrationEntityStatus.TRANSFORMED,
    };

    const results = await Promise.allSettled([
      service.transition(run.id, input),
      service.transition(run.id, input),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION },
    });
  });
});
