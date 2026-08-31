import { authRequest, loginAs, type AuthedRequest } from '@test/support/auth-helper';
import * as bcrypt from 'bcrypt';
import {
  E2eContext,
  createE2eApp,
  teardownE2eApp,
  truncateTables,
  seedSystemRoles,
} from './support/create-e2e-app';

/**
 * Search integration tests against a REAL OpenSearch container. They cover the
 * parts a mocked engine cannot: that the query DSL is accepted, that indexing
 * on mutation actually lands, and that cursor pagination sorts on `id` rather
 * than `_id` (which is not sortable and used to 500).
 *
 * Indexing is asynchronous, but not unpredictable: `ctx.settleSearchIndex()`
 * delivers the domain events and then waits for the `search-indexing` queue to
 * drain. The indexer writes with `refresh: 'wait_for'`, so a drained queue
 * means the documents are searchable — no sleeping required.
 *
 * NOTE: `truncateTables` clears Postgres but NOT the engine index, so documents
 * from earlier cases in this file stay searchable. Two habits keep the
 * assertions exact anyway: every case gets its OWN project key (issue numbers
 * restart at 1 after each truncate, so a shared key would put several different
 * issues at `SRCH-1` in the index), and every query that asserts an exact result
 * set is project-scoped.
 */
describe('Search Integration (real OpenSearch)', () => {
  let ctx: E2eContext;
  let api: AuthedRequest;
  let projectKey: string;
  let projectId: string;
  let caseNumber = 0;

  beforeAll(async () => {
    ctx = await createE2eApp({ withSearchEngine: true });
  }, 180_000); // the engine container can take up to 60s to start

  afterAll(async () => {
    await teardownE2eApp(ctx);
  });

  beforeEach(async () => {
    await truncateTables(ctx.prisma);
    await seedSystemRoles(ctx.prisma);

    await ctx.prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Admin User',
        passwordHash: await bcrypt.hash('adminpass1', 4),
        hasPassword: true,
        role: 'ADMIN',
      },
    });

    const { accessToken } = await loginAs(ctx.app, 'admin@test.local', 'adminpass1');
    api = authRequest(ctx.app, accessToken);

    // A fresh key per case — see the note above the describe.
    caseNumber += 1;
    projectKey = `SRCH${caseNumber}`;
    const projectRes = await api
      .post('/projects')
      .send({ key: projectKey, name: `Search Test Project ${caseNumber}` })
      .expect(201);
    projectId = projectRes.body.data.id;
  });

  async function createIssue(title: string): Promise<{ id: string; number: number }> {
    const res = await api
      .post(`/projects/${projectKey}/issues`)
      .send({ title })
      .expect(201);
    return { id: res.body.data.id, number: res.body.data.number };
  }

  interface SearchItem {
    issue: { id: string; title: string; project: { key: string } };
  }

  async function search(query: string): Promise<{
    items: SearchItem[];
    meta: { total: number; nextCursor: string | null; hasNextPage: boolean };
  }> {
    const res = await api.get(`/search?${query}`).expect(200);
    return { items: res.body.items ?? [], meta: res.body.meta };
  }

  it('answers an empty query instead of failing on the unsortable _id field', async () => {
    const { items, meta } = await search(`q=&projectId=${projectId}&pageSize=25`);

    expect(items).toEqual([]);
    expect(meta.total).toBe(0);
  });

  it('indexes created issues and finds them by a word in the title', async () => {
    await createIssue('Login redirect bug fix');
    await createIssue('Dashboard performance improvement');

    await ctx.settleSearchIndex();

    const { items } = await search(`q=login&projectId=${projectId}&pageSize=10`);
    expect(items.map((i) => i.issue.title)).toEqual(['Login redirect bug fix']);
  });

  it('finds an issue by its exact key, and by bare number when project-scoped', async () => {
    const issue = await createIssue('Find me by key');

    await ctx.settleSearchIndex();

    // Exact key search, e.g. "SRCH3-1" — works in any scope, which is why this
    // one query is deliberately NOT project-scoped.
    const byKey = await search(
      `q=${encodeURIComponent(`${projectKey}-${issue.number}`)}&pageSize=10`,
    );
    expect(byKey.items.map((i) => i.issue.id)).toEqual([issue.id]);

    // A bare number resolves to the issue only when the search is project-scoped.
    const byNumber = await search(
      `q=${issue.number}&projectId=${projectId}&pageSize=10`,
    );
    expect(byNumber.items.map((i) => i.issue.id)).toEqual([issue.id]);
  });

  it('re-indexes an issue when a tag is assigned so tag: finds it', async () => {
    const issue = await createIssue('Issue to be tagged');

    const tagRes = await api
      .post(`/projects/${projectKey}/tags`)
      .send({ name: 'regression', color: '#ff0000' })
      .expect(201);

    // Assign via the dedicated issue-tags endpoint — the path the sidebar uses.
    await api
      .post(`/issues/${issue.id}/tags`)
      .send({ tagId: tagRes.body.data.id })
      .expect(200);

    // The tag link must propagate to the engine (outbox → domain events →
    // indexer) before the issue is findable by tag.
    await ctx.settleSearchIndex();

    const { items } = await search(
      `q=${encodeURIComponent('tag:regression')}&projectId=${projectId}&pageSize=10`,
    );
    expect(items.map((i) => i.issue.id)).toEqual([issue.id]);
  });

  it('scopes results to the requested project', async () => {
    const issue = await createIssue('Searchable issue in project');

    await ctx.settleSearchIndex();

    const { items, meta } = await search(
      `q=searchable&projectId=${projectId}&pageSize=10`,
    );
    expect(meta.total).toBe(1);
    expect(items[0].issue.id).toBe(issue.id);
    expect(items[0].issue.project.key).toBe(projectKey);
  });

  it('pages with a cursor without hitting the _id sort tiebreaker', async () => {
    for (let i = 0; i < 5; i++) {
      await createIssue(`Paginated issue ${i + 1}`);
    }

    await ctx.settleSearchIndex();

    const page1 = await search(`q=paginated&projectId=${projectId}&pageSize=2`);
    expect(page1.items).toHaveLength(2);
    expect(page1.meta.total).toBe(5);
    expect(page1.meta.hasNextPage).toBe(true);
    expect(page1.meta.nextCursor).toBeTruthy();

    // The second page is where sorting on `_id` used to fail.
    const page2 = await search(
      `q=paginated&projectId=${projectId}&pageSize=2&cursor=${encodeURIComponent(page1.meta.nextCursor!)}`,
    );
    expect(page2.items).toHaveLength(2);

    const firstPageIds = page1.items.map((i) => i.issue.id);
    expect(page2.items.every((i) => !firstPageIds.includes(i.issue.id))).toBe(true);
  });
});
