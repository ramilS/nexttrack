import { extractAccessTokenFromCookies } from '@test/support/auth-helper';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

describe('Issue Links Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;

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
    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: hash,
        hasPassword: true,
        role: 'ADMIN',
      },
    });

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.local', password: 'adminpass1' })
      .expect(200);
    adminToken = extractAccessTokenFromCookies(loginRes.headers["set-cookie"]);

    projectKey = 'LNK';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Links Project' })
      .expect(201);
  });

  function authReq() {
    return {
      get: (url: string) =>
        request(ctx.app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${adminToken}`),
      post: (url: string) =>
        request(ctx.app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  async function createIssue(title: string) {
    const res = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title, type: 'TASK' })
      .expect(201);
    return res.body.data;
  }

  function linksUrl(issueId: string, linkId?: string) {
    const base = `/issues/${issueId}/links`;
    return linkId ? `${base}/${linkId}` : base;
  }

  it('should create a RELATES_TO link between two issues', async () => {
    const i1 = await createIssue('Issue A');
    const i2 = await createIssue('Issue B');

    const res = await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'RELATES_TO', targetIssueId: i2.id })
      .expect(201);

    expect(res.body.data.type).toBe('RELATES_TO');
  });

  it('should list links grouped by type', async () => {
    const i1 = await createIssue('Issue A');
    const i2 = await createIssue('Issue B');
    const i3 = await createIssue('Issue C');

    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'RELATES_TO', targetIssueId: i2.id })
      .expect(201);

    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'BLOCKS', targetIssueId: i3.id })
      .expect(201);

    const res = await authReq().get(linksUrl(i1.id)).expect(200);

    const groups: Array<{ type: string; links: unknown[] }> = res.body.data;
    const relates = groups.find((g) => g.type === 'RELATES_TO');
    const blocks = groups.find((g) => g.type === 'BLOCKS');
    expect(relates?.links).toHaveLength(1);
    expect(blocks?.links).toHaveLength(1);
  });

  it('should reject self-referencing link', async () => {
    const issue = await createIssue('Self');

    await authReq()
      .post(linksUrl(issue.id))
      .send({ type: 'RELATES_TO', targetIssueId: issue.id })
      .expect(400);
  });

  it('should reject duplicate link', async () => {
    const i1 = await createIssue('Issue A');
    const i2 = await createIssue('Issue B');

    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'RELATES_TO', targetIssueId: i2.id })
      .expect(201);

    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'RELATES_TO', targetIssueId: i2.id })
      .expect(409);
  });

  it('should detect dependency cycle (IS_BLOCKED_BY maps to DEPENDS_ON)', async () => {
    const i1 = await createIssue('A');
    const i2 = await createIssue('B');
    const i3 = await createIssue('C');

    // A is blocked by B  (Prisma: A depends_on B)
    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'IS_BLOCKED_BY', targetIssueId: i2.id })
      .expect(201);

    // B is blocked by C
    await authReq()
      .post(linksUrl(i2.id))
      .send({ type: 'IS_BLOCKED_BY', targetIssueId: i3.id })
      .expect(201);

    // C is blocked by A → cycle!
    await authReq()
      .post(linksUrl(i3.id))
      .send({ type: 'IS_BLOCKED_BY', targetIssueId: i1.id })
      .expect(400);
  });

  it('should delete a link', async () => {
    const i1 = await createIssue('Issue A');
    const i2 = await createIssue('Issue B');

    const createRes = await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'RELATES_TO', targetIssueId: i2.id })
      .expect(201);
    const linkId = createRes.body.data.id;

    await authReq()
      .delete(linksUrl(i1.id, linkId))
      .expect(204);

    const listRes = await authReq().get(linksUrl(i1.id)).expect(200);
    const groups: Array<{ type: string; links: unknown[] }> = listRes.body.data;
    expect(groups.find((g) => g.type === 'RELATES_TO')).toBeUndefined();
  });

  it('should record activity on linked issues (fire-and-forget)', async () => {
    const i1 = await createIssue('A');
    const i2 = await createIssue('B');

    await authReq()
      .post(linksUrl(i1.id))
      .send({ type: 'BLOCKS', targetIssueId: i2.id })
      .expect(201);

    // Activity is recorded via fire-and-forget — wait briefly for async completion
    await new Promise((r) => setTimeout(r, 500));

    const activities = await ctx.prisma.activity.findMany({
      where: { type: 'LINK_ADD' },
    });

    expect(activities.length).toBeGreaterThanOrEqual(1);
  });
});
