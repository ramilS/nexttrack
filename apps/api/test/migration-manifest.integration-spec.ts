import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';
import {
  GlobalRole,
  MigrationEntityStatus,
  MigrationRunStatus,
} from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import { TEST_SECRETS } from '@repo/test-support';
import { MigrationManifestService } from '@/modules/migration/migration-manifest.service';
import { migrationConfig } from '@/config';
import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request, { type Test } from 'supertest';
import * as bcrypt from 'bcrypt';

const MIGRATION_SECRET = TEST_SECRETS.migrationApiSecret;

describe('Migration manifest (Integration)', () => {
  let ctx: E2eContext;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (builder) =>
        builder.overrideProvider(migrationConfig.KEY).useValue({
          apiSecret: MIGRATION_SECRET,
          allowBackdatedRecords: false,
        }),
    });
  }, 60_000);

  afterAll(async () => teardownE2eApp(ctx));
  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: await bcrypt.hash('adminpass1', 4),
        hasPassword: true,
        role: GlobalRole.ADMIN,
      },
    });
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(login.headers['set-cookie']);
  });

  function migrationRequest<T extends Test>(test: T): T {
    return test
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET) as T;
  }

  function runInput() {
    return {
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      config: { projects: ['APP'] },
      configHash: 'a'.repeat(64),
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    };
  }

  it('requires both an admin JWT and the migration secret to start a run', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/migration/runs')
      .set('x-migration-secret', MIGRATION_SECRET)
      .send(runInput())
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/admin/migration/runs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(runInput())
      .expect(403);
  });

  it('exposes the run and manifest lifecycle through guarded envelopes', async () => {
    const start = await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send(runInput())
      .expect(201);
    const runId = start.body.data.data.id as string;

    expect(start.body.data).toMatchObject({
      data: {
        id: runId,
        sourceSystem: 'youtrack-cloud',
        sourceTenant: 'example.youtrack.cloud',
        status: MigrationRunStatus.RUNNING,
        startedAt: expect.stringMatching(/Z$/),
        completedAt: null,
      },
    });
    expect(Object.keys(start.body.data.data).sort()).toEqual(
      [
        'completedAt',
        'configHash',
        'createdAt',
        'exclusionVersion',
        'id',
        'sourceSystem',
        'sourceTenant',
        'sourceUrl',
        'specVersion',
        'startedAt',
        'status',
        'targetUrl',
        'updatedAt',
      ].sort(),
    );
    expect(JSON.stringify(start.body)).not.toMatch(
      /sourceToken|targetToken|migrationSecret|password|authorization/i,
    );

    const get = await migrationRequest(
      request(ctx.app.getHttpServer()).get(`/admin/migration/runs/${runId}`),
    ).expect(200);
    expect(get.body.data).toMatchObject({
      data: { id: runId },
      counts: {},
    });

    const discover = await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${runId}/entities/discover`,
      ),
    )
      .send({
        entities: [
          {
            entityType: 'issue',
            sourceId: '2-42',
            sourceChecksum: 'b'.repeat(64),
          },
        ],
      })
      .expect(201);
    expect(discover.body.data.data).toEqual([
      expect.objectContaining({
        entityType: 'issue',
        sourceId: '2-42',
        status: MigrationEntityStatus.DISCOVERED,
        discoveredAt: expect.stringMatching(/Z$/),
      }),
    ]);

    await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${runId}/complete`,
      ),
    )
      .expect(400)
      .expect(({ body }) =>
        expect(body.error.code).toBe(ErrorCode.MIGRATION_RUN_INCOMPLETE),
      );

    const transition = await migrationRequest(
      request(ctx.app.getHttpServer()).patch(
        `/admin/migration/runs/${runId}/entities/state`,
      ),
    )
      .send({
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
        status: MigrationEntityStatus.EXCLUDED_APPROVED,
      })
      .expect(200);
    expect(transition.body.data.data).toMatchObject({
      sourceId: '2-42',
      status: MigrationEntityStatus.EXCLUDED_APPROVED,
    });

    const list = await migrationRequest(
      request(ctx.app.getHttpServer())
        .get(`/admin/migration/runs/${runId}/entities`)
        .query({
          entityType: 'issue',
          status: MigrationEntityStatus.EXCLUDED_APPROVED,
          limit: '1',
        }),
    ).expect(200);
    expect(list.body.data.data).toEqual([
      expect.objectContaining({
        sourceId: '2-42',
        status: MigrationEntityStatus.EXCLUDED_APPROVED,
      }),
    ]);

    const complete = await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${runId}/complete`,
      ),
    ).expect(201);
    expect(complete.body.data).toMatchObject({
      data: {
        id: runId,
        status: MigrationRunStatus.COMPLETED,
        completedAt: expect.stringMatching(/Z$/),
      },
      counts: { [MigrationEntityStatus.EXCLUDED_APPROVED]: 1 },
    });
  });

  it('validates exact run literals, checksums, batch size, transitions, and list limits', async () => {
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), sourceSystem: 'youtrack-server' })
      .expect(400);
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), configHash: 'A'.repeat(64) })
      .expect(400);
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), specVersion: 'latest' })
      .expect(400);
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), exclusionVersion: 'latest' })
      .expect(400);

    const start = await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send(runInput())
      .expect(201);
    const runId = start.body.data.data.id as string;

    await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${runId}/entities/discover`,
      ),
    )
      .send({
        entities: Array.from({ length: 501 }, (_, index) => ({
          entityType: 'issue',
          sourceId: `2-${index}`,
          sourceChecksum: 'b'.repeat(64),
        })),
      })
      .expect(400);

    await migrationRequest(
      request(ctx.app.getHttpServer()).patch(
        `/admin/migration/runs/${runId}/entities/state`,
      ),
    )
      .send({
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'not-a-checksum',
        status: MigrationEntityStatus.TRANSFORMED,
      })
      .expect(400);
    await migrationRequest(
      request(ctx.app.getHttpServer()).patch(
        `/admin/migration/runs/${runId}/entities/state`,
      ),
    )
      .send({
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
        status: 'UNKNOWN',
      })
      .expect(400);

    await migrationRequest(
      request(ctx.app.getHttpServer())
        .get(`/admin/migration/runs/${runId}/entities`)
        .query({ limit: 501 }),
    ).expect(400);
  });

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
