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

describe('Tags Integration', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;
  let issueId: string;

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

    projectKey = 'TAG';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'Tags Project' })
      .expect(201);

    const issueRes = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Test Issue', type: 'TASK' })
      .expect(201);
    issueId = issueRes.body.data.id;
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
      patch: (url: string) =>
        request(ctx.app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${adminToken}`),
      delete: (url: string) =>
        request(ctx.app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${adminToken}`),
    };
  }

  function tagsUrl(id?: string) {
    const base = `/projects/${projectKey}/tags`;
    return id ? `${base}/${id}` : base;
  }

  async function createTag(name: string, color = '#FF0000') {
    const res = await authReq()
      .post(tagsUrl())
      .send({ name, color })
      .expect(201);
    return res.body.data;
  }

  it('should create a tag', async () => {
    const tag = await createTag('bug', '#FF0000');

    expect(tag.name).toBe('bug');
    expect(tag.color).toBe('#FF0000');
  });

  it('rejects an invalid tag body with the standard validation envelope', async () => {
    const res = await authReq()
      .post(tagsUrl())
      .send({ name: '', color: '#FF0000' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatchObject({
      name: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('should list tags for a project', async () => {
    await createTag('bug');
    await createTag('feature', '#00FF00');

    const res = await authReq().get(tagsUrl()).expect(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should reject duplicate tag name (case-insensitive)', async () => {
    await createTag('Bug');

    await authReq()
      .post(tagsUrl())
      .send({ name: 'bug', color: '#00FF00' })
      .expect(409);
  });

  it('should update a tag', async () => {
    const tag = await createTag('old');

    const res = await authReq()
      .patch(tagsUrl(tag.id))
      .send({ name: 'new', color: '#0000FF' })
      .expect(200);

    expect(res.body.data.name).toBe('new');
    expect(res.body.data.color).toBe('#0000FF');
  });

  it('should delete a tag', async () => {
    const tag = await createTag('removable');

    await authReq().delete(tagsUrl(tag.id)).expect(204);

    const listRes = await authReq().get(tagsUrl()).expect(200);
    expect(listRes.body.data).toHaveLength(0);
  });

  it('should add a tag to an issue via issue tags endpoint', async () => {
    const tag = await createTag('important');

    await authReq()
      .post(`/issues/${issueId}/tags`)
      .send({ tagId: tag.id })
      .expect(200);

    // Verify via DB
    const issueTags = await ctx.prisma.issueTag.findMany({
      where: { issueId },
    });
    expect(issueTags).toHaveLength(1);
  });

  it('should remove a tag from an issue', async () => {
    const tag = await createTag('removable-tag');

    await authReq()
      .post(`/issues/${issueId}/tags`)
      .send({ tagId: tag.id })
      .expect(200);

    await authReq()
      .delete(`/issues/${issueId}/tags/${tag.id}`)
      .expect(204);

    const issueTags = await ctx.prisma.issueTag.findMany({
      where: { issueId },
    });
    expect(issueTags).toHaveLength(0);
  });
});
