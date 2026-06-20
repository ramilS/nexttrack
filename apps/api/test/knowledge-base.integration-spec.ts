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

describe('Knowledge Base Integration', () => {
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

    projectKey = 'KB';
    await authReq()
      .post('/projects')
      .send({ key: projectKey, name: 'KB Project' })
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

  function articlesUrl(idOrSlug?: string) {
    const base = `/projects/${projectKey}/articles`;
    return idOrSlug ? `${base}/${idOrSlug}` : base;
  }

  async function createArticle(
    title: string,
    overrides?: { slug?: string; parentId?: string },
  ) {
    const res = await authReq()
      .post(articlesUrl())
      .send({ title, ...overrides })
      .expect(201);
    return res.body.data;
  }

  it('should create an article with auto-generated slug', async () => {
    const article = await createArticle('Getting Started Guide');

    expect(article.title).toBe('Getting Started Guide');
    expect(article.slug).toBeTruthy();
    expect(article.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('should create an article with custom slug', async () => {
    const article = await createArticle('API Docs', { slug: 'api-docs' });
    expect(article.slug).toBe('api-docs');
  });

  it('should reject duplicate slugs in same project', async () => {
    await createArticle('First', { slug: 'my-slug' });

    await authReq()
      .post(articlesUrl())
      .send({ title: 'Second', slug: 'my-slug' })
      .expect(409);
  });

  it('should get article by slug', async () => {
    const article = await createArticle('Test Article', { slug: 'test-article' });

    const res = await authReq()
      .get(articlesUrl('test-article'))
      .expect(200);

    expect(res.body.data.id).toBe(article.id);
  });

  it('should create nested articles (parent-child)', async () => {
    const parent = await createArticle('Parent');
    const child = await createArticle('Child', { parentId: parent.id });

    expect(child.parentId).toBe(parent.id);
  });

  it('should get article tree', async () => {
    const parent = await createArticle('Parent');
    await createArticle('Child', { parentId: parent.id });

    const res = await authReq()
      .get(articlesUrl() + '/tree')
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should update an article', async () => {
    const article = await createArticle('Old Title');

    const res = await authReq()
      .patch(articlesUrl(article.id))
      .send({ title: 'New Title' })
      .expect(200);

    expect(res.body.data.title).toBe('New Title');
  });

  it('should publish an article', async () => {
    const article = await createArticle('Draft Article');

    const res = await authReq()
      .post(articlesUrl(article.id) + '/publish')
      .expect(200);

    expect(res.body.data.publishedAt).toBeTruthy();
  });

  it('should reject publishing an already published article', async () => {
    const article = await createArticle('Published');
    await authReq().post(articlesUrl(article.id) + '/publish').expect(200);

    await authReq()
      .post(articlesUrl(article.id) + '/publish')
      .expect(409);
  });

  it('should archive an article', async () => {
    const article = await createArticle('To Archive');

    const res = await authReq()
      .post(articlesUrl(article.id) + '/archive')
      .expect(200);

    expect(res.body.data.archivedAt).toBeTruthy();
  });

  it('should delete an article', async () => {
    const article = await createArticle('To Delete');

    await authReq()
      .delete(articlesUrl(article.id))
      .expect(204);

    const db = await ctx.prisma.article.findUnique({ where: { id: article.id } });
    expect(db).toBeNull();
  });

  it('should move an article to a new parent', async () => {
    const parent = await createArticle('New Parent');
    const child = await createArticle('Orphan');

    await authReq()
      .post(articlesUrl(child.id) + '/move')
      .send({ parentId: parent.id })
      .expect(200);

    const db = await ctx.prisma.article.findUnique({ where: { id: child.id } });
    expect(db!.parentId).toBe(parent.id);
  });

  // ─── Constraint Tests ─────────────────────────────────────

  it('should reject moving article under itself (self-reference)', async () => {
    const article = await createArticle('Self Ref');

    const res = await authReq()
      .post(articlesUrl(article.id) + '/move')
      .send({ parentId: article.id });

    // Should reject with 400 or 409
    expect([400, 409]).toContain(res.status);
  });

  it('should reject circular parent chain (A→B→C, move A under C)', async () => {
    const a = await createArticle('A');
    const b = await createArticle('B', { parentId: a.id });
    const c = await createArticle('C', { parentId: b.id });

    const res = await authReq()
      .post(articlesUrl(a.id) + '/move')
      .send({ parentId: c.id });

    expect([400, 409]).toContain(res.status);
  });

  it('should handle deleting a parent article (children become roots or cascade)', async () => {
    const parent = await createArticle('Parent To Delete');
    const child = await createArticle('Child Under', { parentId: parent.id });

    await authReq()
      .delete(articlesUrl(parent.id))
      .expect(204);

    // Child should still exist with parentId null (orphaned to root) or be deleted
    const dbChild = await ctx.prisma.article.findUnique({ where: { id: child.id } });
    if (dbChild) {
      // Article survived — parentId should be null (orphaned to root)
      expect(dbChild.parentId).toBeNull();
    }
    // If dbChild is null, cascade delete happened — also acceptable
  });

  it('should move article to root (parentId null)', async () => {
    const parent = await createArticle('Parent');
    const child = await createArticle('Nested', { parentId: parent.id });

    await authReq()
      .post(articlesUrl(child.id) + '/move')
      .send({ parentId: null })
      .expect(200);

    const db = await ctx.prisma.article.findUnique({ where: { id: child.id } });
    expect(db!.parentId).toBeNull();
  });
});
