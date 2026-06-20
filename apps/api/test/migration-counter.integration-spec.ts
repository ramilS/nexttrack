import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { TEST_SECRETS } from '@repo/test-support';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

const MIGRATION_SECRET = TEST_SECRETS.migrationApiSecret;

describe('Migration Issue Counter (Integration)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  let projectId: string;
  let projectKey: string;
  let statusId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    const hash = await bcrypt.hash('adminpass1', 4);
    const admin = await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    projectKey = 'MIG';
    const projectRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: projectKey, name: 'Migration Test' })
      .expect(201);
    projectId = projectRes.body.data.id;

    const project = await ctx.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        workflows: {
          where: { isDefault: true },
          take: 1,
          include: { statuses: { orderBy: { ordinal: 'asc' } } },
        },
      },
    });
    const statuses = project.workflows[0].statuses as Array<{ id: string }>;
    statusId = statuses[0].id;
  });

  function migrate(ytNumber: number, ytId: string) {
    return request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: `Migrated ${ytNumber}`,
        statusId,
        reporterId: adminId,
        ytId,
        ytNumber,
      });
  }

  async function getCounter(): Promise<number> {
    const counter = await ctx.prisma.projectIssueCounter.findUnique({
      where: { projectId },
    });
    return counter?.lastNumber ?? 0;
  }

  it('preserves the high-water mark when migrating with a lower ytNumber', async () => {
    // Set counter high by migrating a high ytNumber first.
    await migrate(100, 'yt-100').expect(201);
    expect(await getCounter()).toBe(100);

    // Migrate with a lower ytNumber. Counter must not regress.
    await migrate(50, 'yt-50').expect(201);
    expect(await getCounter()).toBe(100);
  });

  it('raises the counter when migrating with a higher ytNumber', async () => {
    await migrate(10, 'yt-10').expect(201);
    expect(await getCounter()).toBe(10);

    await migrate(75, 'yt-75').expect(201);
    expect(await getCounter()).toBe(75);
  });

  it('keeps the counter at the maximum across out-of-order concurrent migrations', async () => {
    // Concurrent migrations with non-monotonic ytNumbers. End state must be max.
    await Promise.all([
      migrate(40, 'yt-40').expect(201),
      migrate(70, 'yt-70').expect(201),
      migrate(20, 'yt-20').expect(201),
      migrate(60, 'yt-60').expect(201),
    ]);
    expect(await getCounter()).toBe(70);
  });
});
