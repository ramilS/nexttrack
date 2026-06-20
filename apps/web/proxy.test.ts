import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  const redirect = vi.fn().mockImplementation((url: URL) => ({
    type: 'redirect',
    url: url.toString(),
  }));
  const next = vi.fn().mockReturnValue({ type: 'next' });

  return {
    NextResponse: { redirect, next },
  };
});

import { proxy, config } from './proxy';
import { NextResponse } from 'next/server';

function createMockRequest(pathname: string, cookies: Record<string, string> = {}) {
  return {
    nextUrl: { pathname },
    url: 'http://localhost:3000' + pathname,
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      },
    },
  } as unknown as Parameters<typeof proxy>[0];
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows /login through without cookies', () => {
    const result = proxy(createMockRequest('/login'));
    expect(NextResponse.next).toHaveBeenCalled();
    expect(result).toEqual({ type: 'next' });
  });

  it('allows /accept-invite through', () => {
    proxy(createMockRequest('/accept-invite/token123'));
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('allows /sso through', () => {
    proxy(createMockRequest('/sso/google'));
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('redirects to /login when no cookies', () => {
    proxy(createMockRequest('/dashboard'));
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0]![0];
    expect(redirectUrl.toString()).toContain('/login');
    expect(new URL(redirectUrl.toString()).searchParams.get('redirect')).toBe('/dashboard');
  });

  it('allows through with access_token cookie', () => {
    const result = proxy(createMockRequest('/dashboard', { access_token: 'token' }));
    expect(result).toEqual({ type: 'next' });
  });

  it('allows through with refresh_token cookie', () => {
    const result = proxy(createMockRequest('/projects/PROJ/board', { refresh_token: 'token' }));
    expect(result).toEqual({ type: 'next' });
  });

  it('config matcher excludes API routes (handled by route handler)', () => {
    expect(config.matcher[0]).toContain('api');
  });
});
