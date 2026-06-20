import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

test.describe('API: Search (Elasticsearch)', () => {
  test('search with empty query should not return 500', async ({ request }) => {
    const token = await loginAs(request);

    // Empty query triggered _id fielddata error in ES 8+
    const res = await request.get(
      apiUrl(`/search?q=&projectId=${PROJECTS.PLAT.key}&pageSize=25`),
      { headers: authHeaders(token) },
    );

    // Should succeed or return empty results — never 500
    expect(res.status()).toBeLessThan(500);
  });

  test('search with keyword returns results sorted without ES error', async ({ request }) => {
    const token = await loginAs(request);

    const res = await request.get(
      apiUrl('/search?q=issue&pageSize=10'),
      { headers: authHeaders(token) },
    );

    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const body = await res.json();
      const items = body.items ?? [];
      for (const item of items) {
        expect(item.issue).toHaveProperty('id');
        expect(item.issue).toHaveProperty('title');
      }
    }
  });

  test('search with cursor-based pagination should not error', async ({ request }) => {
    const token = await loginAs(request);

    // First page
    const res1 = await request.get(
      apiUrl('/search?q=issue&pageSize=2'),
      { headers: authHeaders(token) },
    );
    expect(res1.status()).toBeLessThan(500);

    if (res1.ok()) {
      const body1 = await res1.json();
      const cursor = body1.data?.nextCursor ?? body1.nextCursor;

      // If there's a next cursor, paginate
      if (cursor) {
        const res2 = await request.get(
          apiUrl(`/search?q=issue&pageSize=2&cursor=${encodeURIComponent(cursor)}`),
          { headers: authHeaders(token) },
        );
        // Cursor pagination uses the sort tiebreaker (was _id, now id)
        // Should not fail with fielddata error
        expect(res2.status()).toBeLessThan(500);
      }
    }
  });
});
