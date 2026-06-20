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

/**
 * Search integration tests with REAL Elasticsearch.
 *
 * These tests start an ES 8 Testcontainer and verify that:
 * - Search queries execute without errors (no _id fielddata issue)
 * - Indexing on issue creation works
 * - Sorting and pagination use the `id` field, not `_id`
 */
describe('Search Integration (real Elasticsearch)', () => {
  let ctx: E2eContext;
  let adminToken: string;
  let projectKey: string;

  beforeAll(async () => {
    ctx = await createE2eApp({ withElasticsearch: true });
  }, 180_000); // ES container can take up to 60s to start

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

    projectKey = 'SRCH';
    await authReq().post('/projects').send({ key: projectKey, name: 'Search Test Project' }).expect(201);
  });

  function authReq() {
    return {
      post: (url: string) =>
        request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${adminToken}`),
      get: (url: string) =>
        request(ctx.app.getHttpServer()).get(url).set('Authorization', `Bearer ${adminToken}`),
    };
  }

  it('should not return 500 on empty query (no _id fielddata error)', async () => {
    const res = await authReq()
      .get(`/search?q=&pageSize=25`);

    // Should succeed or return validation error — never 500
    expect(res.status).toBeLessThan(500);
  });

  it('should index and find created issues', async () => {
    // Create issues
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Login redirect bug fix' })
      .expect(201);
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Dashboard performance improvement' })
      .expect(201);

    // ES indexing is async — poll until indexed (up to 10s)
    let items: Array<{ issue: { title: string } }> = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await authReq().get('/search?q=login&pageSize=10');
      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        items = res.body.items ?? [];
        if (items.length > 0) break;
      }
    }

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(
      items.some((i) => i.issue.title.toLowerCase().includes('login')),
    ).toBe(true);
  });

  it('should re-index and find an issue after a tag is assigned (regression: tag search)', async () => {
    const issueRes = await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Issue to be tagged' })
      .expect(201);
    const issueId = issueRes.body.data.id;

    const tagRes = await authReq()
      .post(`/projects/${projectKey}/tags`)
      .send({ name: 'regression', color: '#ff0000' })
      .expect(201);
    const tagId = tagRes.body.data.id;

    // Assign the tag via the dedicated issue-tags endpoint (the path the sidebar uses)
    await authReq()
      .post(`/issues/${issueId}/tags`)
      .send({ tagId })
      .expect(200);

    // The tag link must propagate to ES (outbox → domain-events → indexer) so the
    // issue becomes findable by tag filter. Poll until the re-index lands.
    const tagQuery = `q=${encodeURIComponent('tag:regression')}&pageSize=10`;
    let items: Array<{ issue: { id: string } }> = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await authReq().get(`/search?${tagQuery}`);
      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        items = res.body.items ?? [];
        if (items.some((i) => i.issue.id === issueId)) break;
      }
    }

    expect(items.some((i) => i.issue.id === issueId)).toBe(true);
  });

  it('should handle search with project filter', async () => {
    await authReq()
      .post(`/projects/${projectKey}/issues`)
      .send({ title: 'Searchable issue in project' })
      .expect(201);

    await new Promise((r) => setTimeout(r, 2000));

    const project = await ctx.prisma.project.findFirst({ where: { key: projectKey } });

    const res = await authReq()
      .get(`/search?q=searchable&projectId=${project!.id}&pageSize=10`);

    expect(res.status).toBeLessThan(500);
  });

  it('should support cursor pagination without _id errors', async () => {
    // Create enough issues for pagination
    for (let i = 0; i < 5; i++) {
      await authReq()
        .post(`/projects/${projectKey}/issues`)
        .send({ title: `Paginated issue ${i + 1}` })
        .expect(201);
    }

    await new Promise((r) => setTimeout(r, 2000));

    // First page with small pageSize
    const page1 = await authReq()
      .get('/search?q=paginated&pageSize=2');

    expect(page1.status).toBeLessThan(500);

    if (page1.status === 200) {
      const cursor = page1.body.meta?.nextCursor;
      if (cursor) {
        // Second page — this is where _id sort tiebreaker was failing
        const page2 = await authReq()
          .get(`/search?q=paginated&pageSize=2&cursor=${encodeURIComponent(cursor)}`);

        expect(page2.status).toBeLessThan(500);
      }
    }
  });
});
