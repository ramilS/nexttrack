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
import { canonicalJsonChecksum } from '@/modules/migration/migration-json';
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
    // Integration setup uses `prisma db push`, which cannot represent partial
    // indexes. Install the exact production-migration defense for this suite.
    await ctx.prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "migration_runs_active_fingerprint_hash_key"
      ON "migration_runs"("fingerprint_hash")
      WHERE "status" <> 'COMPLETED'
    `;
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

  function runInput(): {
    sourceSystem: 'youtrack-cloud';
    sourceTenant: string;
    sourceUrl: string;
    targetUrl: string;
    config: Record<string, unknown>;
    configHash: string;
    specVersion: '2026-07-14';
    exclusionVersion: '2026-07-14';
  } {
    const config = {
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
    return {
      sourceSystem: 'youtrack-cloud',
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
      config,
      configHash: canonicalJsonChecksum(config),
      specVersion: '2026-07-14',
      exclusionVersion: '2026-07-14',
    };
  }

  it('upserts a migrated user by source id and controls email collisions', async () => {
    const endpoint = '/admin/migration/users';
    const first = await migrationRequest(request(ctx.app.getHttpServer()).post(endpoint))
      .send({
        ytId: 'yt-user-1',
        email: 'ALICE@example.com',
        name: 'Alice',
        avatarUrl: '/old',
        isBlocked: false,
        migratedFrom: 'youtrack',
      })
      .expect(201);
    const targetId = first.body.data.data.id as string;
    const createdAt = first.body.data.data.createdAt as string;
    const updatedAt = first.body.data.data.updatedAt as string;

    const changed = await migrationRequest(request(ctx.app.getHttpServer()).post(endpoint))
      .send({
        ytId: 'yt-user-1',
        email: 'renamed@example.com',
        name: 'Alice Renamed',
        avatarUrl: '/new',
        isBlocked: true,
        migratedFrom: 'youtrack-cloud',
      })
      .expect(201);

    expect(changed.body.data).toMatchObject({
      existed: true,
      data: {
        id: targetId,
        email: 'renamed@example.com',
        name: 'Alice Renamed',
        avatarUrl: '/new',
        isBlocked: true,
        migratedFrom: 'youtrack-cloud',
        createdAt,
        updatedAt,
      },
    });

    await ctx.prisma.user.create({
      data: { email: 'owned@example.com', name: 'Owner', hasPassword: false },
    });
    await migrationRequest(request(ctx.app.getHttpServer()).post(endpoint))
      .send({
        ytId: 'yt-user-1',
        email: 'owned@example.com',
        name: 'Collision',
        isBlocked: false,
        migratedFrom: 'youtrack',
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe(ErrorCode.MIGRATION_USER_EMAIL_CONFLICT);
        expect(JSON.stringify(body)).not.toContain('owned@example.com');
      });
  });

  it('keeps concurrent retries for one migrated source user idempotent', async () => {
    const payload = {
      ytId: 'yt-concurrent',
      email: 'concurrent@example.com',
      name: 'Concurrent User',
      isBlocked: false,
      migratedFrom: 'youtrack',
    };
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        migrationRequest(
          request(ctx.app.getHttpServer()).post('/admin/migration/users'),
        )
          .send(payload)
          .expect(201),
      ),
    );
    expect(new Set(responses.map((response) => response.body.data.data.id)).size).toBe(1);
    expect(await ctx.prisma.user.count({ where: { ytId: payload.ytId } })).toBe(1);
  });

  it('rejects caller-controlled config hashes and source tenants before persistence', async () => {
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), configHash: 'b'.repeat(64) })
      .expect(400)
      .expect(({ body }) =>
        expect(body.error.code).toBe(ErrorCode.MIGRATION_CONFIG_HASH_MISMATCH),
      );
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), sourceTenant: 'attacker.example' })
      .expect(400)
      .expect(({ body }) =>
        expect(body.error.code).toBe(ErrorCode.MIGRATION_SOURCE_TENANT_MISMATCH),
      );
    expect(await ctx.prisma.migrationRun.count()).toBe(0);
  });

  it.each([
    (base: ReturnType<typeof runInput>) => ({
      ...base.config,
      unknown: true,
    }),
    (base: ReturnType<typeof runInput>) => ({
      ...base.config,
      estimateField: 'Bearer abcdefghijklmnopqrstuvwxyz',
    }),
    (base: ReturnType<typeof runInput>) => ({
      ...base.config,
      sourceUrl: 'https://other.youtrack.cloud',
    }),
    (base: ReturnType<typeof runInput>) => ({
      ...base.config,
      projects: ['access_token=secret'],
    }),
  ])('rejects strict unsafe run config without persistence', async (mutate) => {
    const base = runInput();
    const config = mutate(base);
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...base, config, configHash: canonicalJsonChecksum(config) })
      .expect(400);
    expect(await ctx.prisma.migrationRun.count()).toBe(0);
  });

  it.each([
    'https://user:password@example.youtrack.cloud',
    'https://example.youtrack.cloud?token=value',
    'https://example.youtrack.cloud#secret',
  ])('rejects non-origin source URLs without persistence', async (sourceUrl) => {
    await migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send({ ...runInput(), sourceUrl })
      .expect(400)
      .expect(({ body }) =>
        expect(body.error.code).toBe(ErrorCode.MIGRATION_RUN_URL_INVALID),
      );
    expect(await ctx.prisma.migrationRun.count()).toBe(0);
  });

  it('uses recursively canonical config JSON for active-run identity', async () => {
    const base = runInput();
    const reordered = {
      rateLimit: 10,
      batchSize: 50,
      concurrency: 3,
      dryRun: false,
      estimateField: null,
      withClosedIssues: false,
      withBoards: false,
      withTimeTracking: false,
      withAttachments: false,
      allProjects: false,
      projects: ['APP'],
      targetUrl: 'http://localhost:3001',
      sourceUrl: 'https://example.youtrack.cloud',
    };
    const first = await startRun({
      ...base,
    });
    const second = await startRun({
      ...base,
      config: reordered,
      configHash: canonicalJsonChecksum(reordered),
    });
    expect(second.body.data.data.id).toBe(first.body.data.data.id);
  });

  async function startRun(input = runInput()) {
    return migrationRequest(
      request(ctx.app.getHttpServer()).post('/admin/migration/runs'),
    )
      .send(input)
      .expect(201);
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

  it('returns the same active run for sequential duplicate starts', async () => {
    const first = await startRun();
    const second = await startRun();

    expect(second.body.data.data.id).toBe(first.body.data.data.id);
    expect(await ctx.prisma.migrationRun.count()).toBe(1);
    expect(first.body.data.data).not.toHaveProperty('fingerprintHash');
    expect(second.body.data.data).not.toHaveProperty('fingerprintHash');
  });

  it('canonicalizes tenant and URL variants into the same active run', async () => {
    const variant = await startRun({
      ...runInput(),
      sourceTenant: 'EXAMPLE.youtrack.cloud',
      sourceUrl: 'https://EXAMPLE.youtrack.cloud/',
      targetUrl: 'http://LOCALHOST:3001/',
    });
    const canonical = await startRun();

    expect(canonical.body.data.data.id).toBe(variant.body.data.data.id);
    expect(variant.body.data.data).toMatchObject({
      sourceTenant: 'example.youtrack.cloud',
      sourceUrl: 'https://example.youtrack.cloud',
      targetUrl: 'http://localhost:3001',
    });
  });

  it('returns one active run for concurrent duplicate starts', async () => {
    const starts = await Promise.all(
      Array.from({ length: 8 }, () => startRun()),
    );

    expect(new Set(starts.map((result) => result.body.data.data.id)).size).toBe(1);
    expect(await ctx.prisma.migrationRun.count()).toBe(1);
  });

  it('returns the same failed run for a duplicate start', async () => {
    const first = await startRun();
    const firstId = first.body.data.data.id as string;
    await ctx.prisma.migrationRun.update({
      where: { id: firstId },
      data: { status: MigrationRunStatus.FAILED },
    });

    const second = await startRun();
    expect(second.body.data.data.id).toBe(firstId);
    expect(second.body.data.data.status).toBe(MigrationRunStatus.FAILED);
  });

  it('enforces active fingerprint uniqueness in PostgreSQL', async () => {
    const started = await startRun();
    const stored = await ctx.prisma.migrationRun.findUniqueOrThrow({
      where: { id: started.body.data.data.id as string },
    });

    await expect(
      ctx.prisma.migrationRun.create({
        data: {
          sourceSystem: stored.sourceSystem,
          sourceTenant: stored.sourceTenant,
          sourceUrl: stored.sourceUrl,
          targetUrl: stored.targetUrl,
          config: { projects: ['APP'] },
          configHash: stored.configHash,
          specVersion: stored.specVersion,
          exclusionVersion: stored.exclusionVersion,
          fingerprintHash: stored.fingerprintHash,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('creates a new run for the same fingerprint after completion', async () => {
    const first = await startRun();
    const firstId = first.body.data.data.id as string;
    await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${firstId}/complete`,
      ),
    ).expect(201);

    const second = await startRun();
    expect(second.body.data.data.id).not.toBe(firstId);
    expect(await ctx.prisma.migrationRun.count()).toBe(2);
  });

  it('keeps a completed predecessor immutable after an active successor starts', async () => {
    const service = ctx.app.get(MigrationManifestService);
    const first = await startRun();
    const firstId = first.body.data.data.id as string;
    await service.discover(firstId, [
      { entityType: 'issue', sourceId: '2-42', sourceChecksum: 'b'.repeat(64) },
    ]);
    await service.transition(firstId, {
      entityType: 'issue',
      sourceId: '2-42',
      sourceChecksum: 'b'.repeat(64),
      status: MigrationEntityStatus.EXCLUDED_APPROVED,
    });
    await service.complete(firstId);
    await startRun();

    await expect(
      service.discover(firstId, [
        { entityType: 'issue', sourceId: '2-42', sourceChecksum: 'c'.repeat(64) },
      ]),
    ).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
    });
    await expect(
      service.transition(firstId, {
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: 'b'.repeat(64),
        status: MigrationEntityStatus.DISCOVERED,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
    });
    await expect(
      ctx.prisma.migrationEntity.findFirstOrThrow({
        where: { runId: firstId, sourceId: '2-42' },
      }),
    ).resolves.toMatchObject({
      sourceChecksum: 'b'.repeat(64),
      status: MigrationEntityStatus.EXCLUDED_APPROVED,
    });
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

  it('persists and returns useful sanitized failure details', async () => {
    const started = await startRun();
    const runId = started.body.data.data.id as string;
    const checksum = 'b'.repeat(64);
    await migrationRequest(
      request(ctx.app.getHttpServer()).post(
        `/admin/migration/runs/${runId}/entities/discover`,
      ),
    ).send({ entities: [{ entityType: 'issue', sourceId: '2-42', sourceChecksum: checksum }] });

    const failed = await migrationRequest(
      request(ctx.app.getHttpServer()).patch(
        `/admin/migration/runs/${runId}/entities/state`,
      ),
    )
      .send({
        entityType: 'issue',
        sourceId: '2-42',
        sourceChecksum: checksum,
        status: MigrationEntityStatus.FAILED,
        error: {
          code: 'UPSTREAM_422',
          message:
            'Target rejected entity: sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
          details: {
            status: 422,
            operation: 'createIssue',
            nested: {
              authorization: 'Bearer should-never-persist',
              api_key: 'should-never-persist',
              reason: 'invalid state',
            },
            cookie: 'session=should-never-persist',
          },
        },
      })
      .expect(200);

    const list = await migrationRequest(
      request(ctx.app.getHttpServer()).get(
        `/admin/migration/runs/${runId}/entities`,
      ),
    ).expect(200);
    const stored = await ctx.prisma.migrationEntity.findFirstOrThrow({
      where: { runId, sourceId: '2-42' },
    });
    for (const value of [failed.body.data.data.errorDetails, list.body.data.data[0].errorDetails, stored.errorDetails]) {
      expect(value).toMatchObject({
        status: 422,
        operation: 'createIssue',
        nested: { reason: 'invalid state' },
      });
      expect(JSON.stringify(value)).not.toMatch(
        /authorization|cookie|api_key|should-never-persist/i,
      );
    }
    for (const message of [
      failed.body.data.data.errorMessage,
      list.body.data.data[0].errorMessage,
      stored.errorMessage,
    ]) {
      expect(message).toContain('Target rejected entity');
      expect(message).toContain('[redacted]');
      expect(message).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    }
  });

  it('returns an already completed run unchanged, including with an active successor', async () => {
    const service = ctx.app.get(MigrationManifestService);
    const first = await startRun();
    const firstId = first.body.data.data.id as string;
    const initial = await service.complete(firstId);
    const completedAt = initial.run.completedAt;
    const updatedAt = initial.run.updatedAt;
    await startRun();

    const repeated = await service.complete(firstId);
    expect(repeated).toEqual(initial);
    expect(repeated.run.completedAt).toEqual(completedAt);
    expect(repeated.run.updatedAt).toEqual(updatedAt);
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
        status: MigrationEntityStatus.FAILED,
        error: { code: 'lowercase freeform', message: 'failed' },
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
        fingerprintHash: 'f'.repeat(64),
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
        fingerprintHash: 'f'.repeat(64),
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
        fingerprintHash: 'f'.repeat(64),
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
        fingerprintHash: 'f'.repeat(64),
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
