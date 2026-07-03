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
    // Backdating enabled so the attachment/date-carrying tests here can preserve
    // original timestamps (rejection-when-disabled has its own describe).
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

  it('creates a custom field (idempotent) with server-generated option ids and maps a value', async () => {
    const create = () =>
      request(ctx.app.getHttpServer())
        .post(`/admin/migration/projects/${projectKey}/custom-fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-migration-secret', MIGRATION_SECRET)
        .send({
          name: 'Subsystem',
          type: CustomFieldType.ENUM,
          config: { type: CustomFieldType.ENUM, options: [{ name: 'Backend' }, { name: 'Frontend' }] },
        });

    const first = await create();
    expect(first.status).toBe(201);
    expect(first.body.data.existed).toBe(false);
    const fieldId = first.body.data.data.id;
    const backend = first.body.data.data.options.find(
      (o: { name: string }) => o.name === 'Backend',
    );
    expect(backend.id).toBeDefined();

    // Re-create the same field → idempotent, same id, options unchanged.
    const second = await create();
    expect(second.body.data.existed).toBe(true);
    expect(second.body.data.data.id).toBe(fieldId);

    // A migrated issue can now carry the field value (option id).
    const issueRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${projectKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        title: 'With subsystem',
        statusId,
        reporterId: adminId,
        ytId: 'yt-cf-1',
        fieldValues: [{ fieldId, value: backend.id }],
      })
      .expect(201);
    const issueId = issueRes.body.data.data.id;

    const stored = await ctx.prisma.customFieldValue.findFirst({
      where: { issueId, customFieldId: fieldId },
    });
    expect(stored?.value).toBe(backend.id);
  });

  it('streams an attachment (any type/size), backdated to its original author + date', async () => {
    const issueRes = await migrate(300, 'yt-att-300').expect(201);
    const issueId = issueRes.body.data.data.id;

    const body = Buffer.from('fake executable bytes');
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${issueId}/attachments`)
      .query({
        filename: 'installer.exe',
        // A type the interactive endpoint's allow-list would reject — proving
        // the migration path bypasses it.
        mimeType: 'application/x-msdownload',
        uploadedById: adminId,
        originalCreatedAt: '2021-02-03T04:05:06.000Z',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .set('Content-Type', 'application/octet-stream')
      .send(body);
    expect(res.status).toBe(201);
    const attachmentId = res.body.data.data.id;

    const stored = await ctx.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    expect(stored.filename).toBe('installer.exe');
    expect(stored.mimeType).toBe('application/x-msdownload');
    expect(stored.size).toBe(body.length);
    expect(stored.uploadedById).toBe(adminId);
    expect(stored.createdAt.toISOString()).toBe('2021-02-03T04:05:06.000Z');
  });

  it('imports backdated change history (idempotent per issue)', async () => {
    const issueRes = await migrate(310, 'yt-hist-310').expect(201);
    const issueId = issueRes.body.data.data.id;

    const post = () =>
      request(ctx.app.getHttpServer())
        .post(`/admin/migration/issues/${issueId}/activities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-migration-secret', MIGRATION_SECRET)
        .send({
          entries: [
            { type: 'ISSUE_CREATED', actorId: adminId, createdAt: '2019-03-01T00:00:00.000Z', payload: {} },
            {
              type: 'FIELD_VALUE_CHANGE',
              actorId: adminId,
              createdAt: '2019-04-01T10:00:00.000Z',
              payload: { field: 'State', from: 'Bug', to: 'Open' },
            },
          ],
        });

    const first = await post();
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(2);

    const stored = await ctx.prisma.activity.findMany({
      where: { issueId },
      orderBy: { createdAt: 'asc' },
    });
    expect(stored).toHaveLength(2);
    expect(stored[0].type).toBe('ISSUE_CREATED');
    expect(stored[0].createdAt.toISOString()).toBe('2019-03-01T00:00:00.000Z');
    expect(stored[1].payload).toEqual({ field: 'State', from: 'Bug', to: 'Open' });
    expect(stored[1].actorId).toBe(adminId);

    // Idempotent: a re-run does not duplicate the timeline.
    const second = await post();
    expect(second.body.data.created).toBe(0);
    expect(await ctx.prisma.activity.count({ where: { issueId } })).toBe(2);
  });

  it('creates a non-parent issue link between two migrated issues', async () => {
    const sourceRes = await migrate(201, 'yt-link-src').expect(201);
    const targetRes = await migrate(202, 'yt-link-tgt').expect(201);
    const sourceId = sourceRes.body.data.data.id;
    const targetId = targetRes.body.data.data.id;

    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${sourceId}/links`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ type: 'RELATES_TO', targetIssueId: targetId });
    expect(res.status).toBe(201);

    const link = await ctx.prisma.issueLink.findFirst({
      where: {
        OR: [
          { sourceIssueId: sourceId, targetIssueId: targetId },
          { sourceIssueId: targetId, targetIssueId: sourceId },
        ],
      },
    });
    expect(link).not.toBeNull();
    expect(link?.type).toBe('RELATES_TO');
  });

  it('imports time logs and recalculates issue.spent', async () => {
    const issueRes = await migrate(210, 'yt-tl-210').expect(201);
    const issueId = issueRes.body.data.data.id;

    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/issues/${issueId}/time-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({
        entries: [
          { userId: adminId, minutes: 30, date: '2023-01-01T00:00:00.000Z' },
          { userId: adminId, minutes: 90, date: '2023-01-02T00:00:00.000Z', description: 'work' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);

    const issue = await ctx.prisma.issue.findUnique({ where: { id: issueId } });
    expect(issue?.spent).toBe(120);

    const logs = await ctx.prisma.timeLog.findMany({ where: { issueId } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.source === 'IMPORT')).toBe(true);
  });

  it('creates a board + sprint and assigns a migrated issue to it', async () => {
    const boardRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/projects/${projectKey}/boards`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ name: 'Migrated Board', type: 'SCRUM' });
    expect(boardRes.status).toBe(201);
    const boardId = boardRes.body.data.data.id;

    const sprintRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/boards/${boardId}/sprints`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ name: 'Sprint 1', goal: 'Ship it' });
    expect(sprintRes.status).toBe(201);
    const sprintId = sprintRes.body.data.data.id;

    const issueRes = await migrate(220, 'yt-sprint-220').expect(201);
    const issueId = issueRes.body.data.data.id;

    const addRes = await request(ctx.app.getHttpServer())
      .post(`/admin/migration/boards/${boardId}/sprints/${sprintId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ issueIds: [issueId] });
    expect(addRes.status).toBe(201);
    expect(addRes.body.data.added).toBe(1);

    const issue = await ctx.prisma.issue.findUnique({ where: { id: issueId } });
    expect(issue?.sprintId).toBe(sprintId);
  });

  it('creates a project (idempotent) with a workflow provisioned from YouTrack states', async () => {
    const body = {
      key: 'NEWP',
      name: 'New Project',
      description: 'auto-created',
      statuses: [
        { name: 'Submitted', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
        { name: 'Fixed', category: 'DONE', isInitial: false, isResolved: true, ordinal: 1 },
      ],
    };

    const first = await request(ctx.app.getHttpServer())
      .post('/admin/migration/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.existed).toBe(false);
    const newProjectId = first.body.data.data.id;

    // Workflow statuses provisioned by name (so issue status mapping resolves).
    const statuses = await ctx.prisma.workflowStatus.findMany({
      where: { workflow: { projectId: newProjectId, isDefault: true } },
      orderBy: { ordinal: 'asc' },
    });
    expect(statuses.map((s) => s.name)).toEqual(['Submitted', 'Fixed']);
    expect(statuses.find((s) => s.isInitial)?.name).toBe('Submitted');

    // Re-create → idempotent.
    const second = await request(ctx.app.getHttpServer())
      .post('/admin/migration/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send(body);
    expect(second.body.data.existed).toBe(true);
    expect(second.body.data.data.id).toBe(newProjectId);
  });

  it('backdates an attachment to its original date + author', async () => {
    const issueRes = await migrate(230, 'yt-att-230').expect(201);
    const issueId = issueRes.body.data.data.id;
    const author = await ctx.prisma.user.create({
      data: { email: 'att-author@test.local', name: 'Att Author', role: 'USER' },
    });
    const attachment = await ctx.prisma.attachment.create({
      data: {
        issueId,
        uploadedById: adminId,
        filename: 'design.png',
        storagePath: 'x/design.png',
        mimeType: 'image/png',
        size: 123,
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/migration/attachments/${attachment.id}/metadata`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-migration-secret', MIGRATION_SECRET)
      .send({ uploadedById: author.id, originalCreatedAt: '2019-05-06T00:00:00.000Z' });
    expect(res.status).toBe(200);

    const updated = await ctx.prisma.attachment.findUnique({
      where: { id: attachment.id },
    });
    expect(updated?.uploadedById).toBe(author.id);
    expect(updated?.createdAt.toISOString()).toBe('2019-05-06T00:00:00.000Z');
  });
});

describe('Migration Backdating Gate (Integration)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let adminId: string;
  let projectKey: string;
  let statusId: string;

  beforeAll(async () => {
    // Pin backdating OFF explicitly — do NOT rely on the ambient env being
    // unset (a developer's root .env may set MIGRATION_ALLOW_BACKDATED_RECORDS
    // for a real migration run, which the harness would otherwise inherit).
    ctx = await createE2eApp({
      customize: (builder) =>
        builder.overrideProvider(migrationConfig.KEY).useValue({
          apiSecret: MIGRATION_SECRET,
          allowBackdatedRecords: false,
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
