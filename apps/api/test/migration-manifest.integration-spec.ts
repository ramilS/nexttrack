import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
} from './support/create-e2e-app';

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
});
