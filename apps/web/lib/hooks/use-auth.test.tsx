import { describe, it, expect, vi } from 'vitest';

// use-auth.ts pulls in the api client, auth store and broadcast channel at import
// time. We only exercise the pure safeRedirectTarget guard here, so stub those
// modules to avoid their side effects (axios instance, BroadcastChannel, etc.).
vi.mock('@/lib/api/auth.api', () => ({ authApi: {} }));
vi.mock('@/lib/api/client', () => ({ bumpTokenVersion: vi.fn() }));
vi.mock('@/lib/stores/auth.store', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/lib/auth/auth-broadcast', () => ({ publishAuthEvent: vi.fn() }));

import { safeRedirectTarget } from './use-auth';

const SAFE_DEFAULT = '/dashboard';

describe('safeRedirectTarget (open-redirect guard)', () => {
  it('falls back to the safe default when the target is null', () => {
    expect(safeRedirectTarget(null)).toBe(SAFE_DEFAULT);
  });

  it('falls back to the safe default for an empty string', () => {
    expect(safeRedirectTarget('')).toBe(SAFE_DEFAULT);
  });

  it('accepts a normal in-app absolute path', () => {
    expect(safeRedirectTarget('/issues')).toBe('/issues');
  });

  it('accepts an in-app path with query string and hash', () => {
    expect(safeRedirectTarget('/projects/ABC/board?tab=1#top')).toBe(
      '/projects/ABC/board?tab=1#top',
    );
  });

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(safeRedirectTarget('//evil.com')).toBe(SAFE_DEFAULT);
  });

  it('rejects protocol-relative URLs with a path (//evil.com/path)', () => {
    expect(safeRedirectTarget('//evil.com/steal')).toBe(SAFE_DEFAULT);
  });

  it('rejects absolute http URLs', () => {
    expect(safeRedirectTarget('http://evil.com')).toBe(SAFE_DEFAULT);
  });

  it('rejects absolute https URLs', () => {
    expect(safeRedirectTarget('https://evil.com/phish')).toBe(SAFE_DEFAULT);
  });

  it('rejects javascript: pseudo-URLs', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBe(SAFE_DEFAULT);
  });

  it('rejects relative paths that do not start with a slash', () => {
    expect(safeRedirectTarget('issues')).toBe(SAFE_DEFAULT);
  });

  it('redirects /login back to the safe default to avoid a login loop', () => {
    expect(safeRedirectTarget('/login')).toBe(SAFE_DEFAULT);
  });

  it('treats any /login* path as unsafe (e.g. /login?next=...)', () => {
    expect(safeRedirectTarget('/login?next=/admin')).toBe(SAFE_DEFAULT);
  });
});
