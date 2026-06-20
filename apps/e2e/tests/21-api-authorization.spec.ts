import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { TEAM_MEMBERS, PROJECTS, DEFAULT_PASSWORD } from '@fixtures/test-data';

test.describe('API Boundary: Authorization', () => {
  let adminToken: string;
  let userToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request);
    userToken = await loginAs(request, TEAM_MEMBERS.JORDAN.email, DEFAULT_PASSWORD);
  });

  test('unauthenticated request to protected endpoint returns 401', async () => {
    const res = await fetch(apiUrl('/projects'));
    expect(res.status).toBe(401);
  });

  test('invalid token returns 401', async () => {
    const res = await fetch(apiUrl('/projects'), {
      headers: authHeaders('invalid-jwt-token'),
    });
    expect(res.status).toBe(401);
  });

  test('regular user cannot access admin user list', async () => {
    const res = await fetch(apiUrl('/users'), {
      headers: authHeaders(userToken),
    });
    expect(res.status).toBe(403);
  });

  test('regular user cannot create projects (admin only)', async () => {
    const res = await fetch(apiUrl('/projects'), {
      method: 'POST',
      headers: { ...authHeaders(userToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Project', key: 'UNAUTH' }),
    });
    expect([403, 401]).toContain(res.status);
  });

  test('regular user cannot delete projects', async () => {
    const res = await fetch(apiUrl(`/projects/${PROJECTS.PLAT.key}`), {
      method: 'DELETE',
      headers: authHeaders(userToken),
    });
    expect([403, 401]).toContain(res.status);
  });

  test('regular user cannot invite users (admin only)', async () => {
    const res = await fetch(apiUrl('/users/invite'), {
      method: 'POST',
      headers: { ...authHeaders(userToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hacker@evil.com' }),
    });
    expect([403, 401]).toContain(res.status);
  });

  test('admin can access admin endpoints', async () => {
    const res = await fetch(apiUrl('/users'), {
      headers: authHeaders(adminToken),
    });
    expect(res.ok).toBeTruthy();
  });

  test('admin can list projects', async () => {
    const res = await fetch(apiUrl('/projects'), {
      headers: authHeaders(adminToken),
    });
    expect(res.ok).toBeTruthy();
    const body = await res.json();
    const items = body.data?.items ?? body.items ?? [];
    expect(items.length).toBeGreaterThan(0);
  });
});
