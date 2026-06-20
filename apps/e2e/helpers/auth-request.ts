import { APIRequestContext } from '@playwright/test';
import { ADMIN_USER } from '../fixtures/test-data';
import { getE2eEnv } from './env';

export async function loginAs(
  request: APIRequestContext,
  email: string = ADMIN_USER.email,
  password: string = ADMIN_USER.password,
): Promise<string> {
  const { apiUrl } = getE2eEnv();
  const res = await request.post(`${apiUrl}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}): ${await res.text()}`);
  }

  // access_token is delivered as an httpOnly cookie, not in the body.
  // Playwright's APIRequestContext exposes them via response.headersArray()
  // (because get('set-cookie') joins multi-cookie headers with a comma,
  // which collides with the Expires=... date format).
  const setCookieHeaders = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  for (const cookie of setCookieHeaders) {
    const match = cookie.match(/^access_token=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  throw new Error('access_token cookie missing from login response');
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function apiUrl(path: string): string {
  const { apiUrl: base } = getE2eEnv();
  return `${base}/api${path}`;
}
