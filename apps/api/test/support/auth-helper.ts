import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  cookies: string[];
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  };
}

/**
 * Performs `/auth/login` and extracts both tokens from the httpOnly cookies
 * the server sets. Use the returned `accessToken` in `Authorization: Bearer`
 * headers, or pass `cookies` to `.set('Cookie', ...)` for cookie-auth flows.
 *
 * Auth tokens are not returned in the response body (see project rule
 * nestjs-auth-sessions.md). This helper does the cookie extraction so test
 * specs can stay readable.
 */
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  const cookies = (res.headers['set-cookie'] || []) as unknown as string[];
  const accessToken = extractCookieValue(cookies, 'access_token');
  const refreshToken = extractCookieValue(cookies, 'refresh_token');

  if (!accessToken) {
    throw new Error('access_token cookie missing from login response');
  }

  return {
    accessToken,
    refreshToken: refreshToken ?? '',
    cookies,
    user: res.body.data.user,
  };
}

/**
 * Pulls the access_token value out of a Set-Cookie header.
 * Use for tests that already manually call `/auth/login` and only need
 * the access token for subsequent `Authorization: Bearer ...` requests.
 */
export function extractAccessTokenFromCookies(
  setCookieHeader: unknown,
): string {
  const cookies = (Array.isArray(setCookieHeader)
    ? setCookieHeader
    : []) as string[];
  const token = extractCookieValue(cookies, 'access_token');
  if (!token) {
    throw new Error('access_token cookie missing from response');
  }
  return token;
}

function extractCookieValue(cookies: string[], name: string): string | null {
  for (const cookie of cookies) {
    const match = cookie.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}
