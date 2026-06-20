import { test, expect } from '@playwright/test';
import { loginAs, authHeaders, apiUrl } from '@helpers/auth-request';
import { PROJECTS } from '@fixtures/test-data';

test.describe('API Boundary: Validation', () => {
  test('reject project with empty name', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(apiUrl('/projects'), {
      headers: authHeaders(token),
      data: { name: '', key: 'EMPTY' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject project with invalid key format', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(apiUrl('/projects'), {
      headers: authHeaders(token),
      data: { name: 'Test Project', key: 'invalid-lowercase' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject project key shorter than 2 chars', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(apiUrl('/projects'), {
      headers: authHeaders(token),
      data: { name: 'Test Project', key: 'X' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject duplicate project key', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(apiUrl('/projects'), {
      headers: authHeaders(token),
      data: { name: 'Duplicate Key Test', key: PROJECTS.PLAT.key },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('reject issue with empty title', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      {
        headers: authHeaders(token),
        data: { title: '' },
      },
    );
    expect(res.status()).toBe(400);
  });

  test('reject issue with title exceeding 500 chars', async ({ request }) => {
    const token = await loginAs(request);
    const res = await request.post(
      apiUrl(`/projects/${PROJECTS.PLAT.key}/issues`),
      {
        headers: authHeaders(token),
        data: { title: 'x'.repeat(501) },
      },
    );
    expect(res.status()).toBe(400);
  });

  test('reject login with invalid email format', async ({ request }) => {
    const res = await request.post(apiUrl('/auth/login'), {
      data: { email: 'not-an-email', password: 'Password123!' },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('reject login with short password', async ({ request }) => {
    const res = await request.post(apiUrl('/auth/login'), {
      data: { email: 'test@test.com', password: 'short' },
    });
    expect(res.ok()).toBeFalsy();
  });
});
