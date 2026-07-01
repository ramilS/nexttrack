import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { TEST_SECRETS } from '@repo/test-support';
import { ErrorCode } from '@repo/shared/error-codes';
import { CustomFieldType } from '@prisma/client';
import { migrationConfig } from '@/config';
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

  it('creates a tag (idempotent) and links it to a migrated issue', async () => {
    const first = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/projects/${projectKey}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ name: 'regression', color: 'red' });
    expect(first.status).toBe(201);
    expect(first.body.data.existed).toBe(false);
    const tagId = first.body.data.data.id;

    // Re-create the same tag → idempotent, returns the existing id.
    const second = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/projects/${projectKey}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ name: 'regression', color: 'blue' });
    expect(second.body.data.existed).toBe(true);
    expect(second.body.data.data.id).toBe(tagId);

    const issueRes = await migrate(5, 'yt-tag-5').expect(201);
    const issueId = issueRes.body.data.data.id;

    const linkRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${issueId}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ tagIds: [tagId] });
    expect(linkRes.status).toBe(201);
    expect(linkRes.body.data.linked).toBe(1);

    const link = await ctx.prisma.issueTag.findFirst({
      where: { issueId, tagId },
    });
    expect(link).not.toBeNull();
  });
});

describe('Migration Backdating Gate (Integration)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
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
    adminToken = extractAccessTokenFromCookies(loginRes.headers['set-cookie']);

    projectKey = 'MIGBD';
    const projectRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: projectKey, name: 'Migration Backdating Test' })
      .expect(201);
    const projectId = projectRes.body.data.id;

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

  it('rejects backdated issue timestamps when backdating is disabled', async () => {
    // The default test harness leaves MIGRATION_ALLOW_BACKDATED_RECORDS unset (false).
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: 'Backdated',
        statusId,
        reporterId: adminId,
        ytId: 'yt-backdate-1',
        originalCreatedAt: '2020-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.MIGRATION_BACKDATING_DISABLED);
  });

  it('creates the issue when no backdated timestamps are provided', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: 'Not backdated',
        statusId,
        reporterId: adminId,
        ytId: 'yt-backdate-2',
      });

    expect(res.status).toBe(201);
  });

  it('creates a project tag idempotently and links it to a migrated issue', async () => {
    const issueRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: 'Tag target',
        statusId,
        reporterId: adminId,
        ytId: 'yt-tag-target',
      })
      .expect(201);
    const issueId = issueRes.body.data.data.id;

    const createTag = () =>
      request(ctx.app.getHttpServer())
        .post(`/admin/migration/projects/${projectKey}/tags`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-migration-secret', MIGRATION_SECRET)
        .send({ name: 'regression', color: 'red' });

    const first = await createTag().expect(201);
    expect(first.body.data.existed).toBe(false);
    const tagId = first.body.data.data.id;

    const second = await createTag().expect(201);
    expect(second.body.data.existed).toBe(true);
    expect(second.body.data.data.id).toBe(tagId);

    const linkRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${issueId}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ tagIds: [tagId] })
      .expect(201);
    expect(linkRes.body.data.linked).toBe(1);

    const link = await ctx.prisma.issueTag.findUnique({
      where: { issueId_tagId: { issueId, tagId } },
    });
    expect(link).not.toBeNull();
  });

  it('creates an issue link idempotently between migrated issues', async () => {
    const createIssue = (ytId: string, title: string) =>
      request(ctx.app.getHttpServer())
        .post(`/admin/migration/issues/${projectKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-migration-secret', MIGRATION_SECRET)
        .send({ title, statusId, reporterId: adminId, ytId })
        .expect(201);

    const a = await createIssue('yt-link-a', 'Link A');
    const b = await createIssue('yt-link-b', 'Link B');
    const sourceId = a.body.data.data.id;
    const targetId = b.body.data.data.id;

    const link = () =>
      request(ctx.app.getHttpServer())
        .post(`/admin/migration/issues/${sourceId}/links`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-migration-secret', MIGRATION_SECRET)
        .send({ type: 'RELATES_TO', targetIssueId: targetId });

    const first = await link().expect(201);
    expect(first.body.data.existed).toBe(false);
    expect(first.body.data.data.id).toBeDefined();

    const second = await link().expect(201);
    expect(second.body.data.existed).toBe(true);

    const rows = await ctx.prisma.issueLink.findMany({
      where: { sourceIssueId: sourceId, targetIssueId: targetId },
    });
    expect(rows).toHaveLength(1);
  });

  it('returns the project custom-field map with enum options', async () => {
    const project = await ctx.prisma.project.findFirstOrThrow({
      where: { key: projectKey },
    });
    await ctx.prisma.customField.create({
      data: {
        projectId: project.id,
        name: 'Severity',
        type: CustomFieldType.ENUM,
        ordinal: 0,
        config: {
          options: [
            { id: 'opt-high', name: 'High', color: null, ordinal: 0 },
            { id: 'opt-low', name: 'Low', color: null, ordinal: 1 },
          ],
        },
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/migration/custom-fields/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET);

    expect(res.status).toBe(200);
    const severity = res.body.data.data.find(
      (f: { name: string }) => f.name === 'Severity',
    );
    expect(severity).toBeDefined();
    expect(severity.type).toBe('ENUM');
    expect(
      severity.options.map((o: { name: string }) => o.name).sort(),
    ).toEqual(['High', 'Low']);
  });

  it('returns the project default workflow statuses including the one issues use', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/migration/statuses/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.data.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.data.map((s: { id: string }) => s.id),
    ).toContain(statusId);
  });

  it('adds migrated users as members, resolving the role name to its id', async () => {
    const project = await ctx.prisma.project.findFirstOrThrow({
      where: { key: projectKey },
    });
    const dev = await ctx.prisma.user.create({
      data: { email: 'dev@test.local', name: 'Dev', role: 'USER' },
    });
    const qa = await ctx.prisma.user.create({
      data: { email: 'qa@test.local', name: 'Qa', role: 'USER' },
    });

    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/projects/${projectKey}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        members: [
          { userId: dev.id }, // no role → default Developer
          { userId: qa.id, roleName: 'QA' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(2);

    const devMember = await ctx.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: dev.id, projectId: project.id } },
    });
    const qaMember = await ctx.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: qa.id, projectId: project.id } },
    });
    expect(devMember?.roleId).toBe('00000000-0000-0000-0000-000000000002'); // Developer
    expect(qaMember?.roleId).toBe('00000000-0000-0000-0000-000000000003'); // QA
  });
});

describe('Migration Backdating Gate — allowed (Integration)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  let projectKey: string;
  let statusId: string;

  beforeAll(async () => {
    ctx = await createE2eApp({
      customize: (builder) =>
        builder.overrideProvider(migrationConfig.KEY).useValue({
          apiSecret: MIGRATION_SECRET,
          allowBackdatedRecords: true,
        }),
    });
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
    adminToken = extractAccessTokenFromCookies(loginRes.headers['set-cookie']);

    projectKey = 'MIGBDOK';
    const projectRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: projectKey, name: 'Migration Backdating Allowed Test' })
      .expect(201);
    const projectId = projectRes.body.data.id;

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

  it('applies backdated timestamps when backdating is allowed', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: 'Backdated',
        statusId,
        reporterId: adminId,
        ytId: 'yt-backdate-allowed-1',
        originalCreatedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    const issue = await ctx.prisma.issue.findUniqueOrThrow({
      where: { id: res.body.data.data.id },
    });
    expect(issue.createdAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });
});
