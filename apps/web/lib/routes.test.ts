import { describe, it, expect } from 'vitest';
import { routes } from './routes';

describe('routes', () => {
  describe('static routes', () => {
    it('returns dashboard path', () => {
      expect(routes.dashboard).toBe('/dashboard');
    });

    it('returns profile path', () => {
      expect(routes.profile).toBe('/profile');
    });

    it('returns notifications paths', () => {
      expect(routes.notifications.list).toBe('/notifications');
      expect(routes.notifications.preferences).toBe('/notifications/preferences');
    });
  });

  describe('project()', () => {
    const p = routes.project('ACME');

    it('builds issues list', () => {
      expect(p.issues.list).toBe('/projects/ACME/issues');
    });

    it('builds issue detail', () => {
      expect(p.issues.detail(42)).toBe('/projects/ACME/issues/42');
    });

    it('builds board', () => {
      expect(p.board).toBe('/projects/ACME/board');
    });

    it('builds knowledge base paths', () => {
      expect(p.knowledgeBase.list).toBe('/projects/ACME/knowledge-base');
      expect(p.knowledgeBase.article('my-slug')).toBe('/projects/ACME/knowledge-base/my-slug');
    });

    it('builds settings paths', () => {
      expect(p.settings.root).toBe('/projects/ACME/settings');
      expect(p.settings.members).toBe('/projects/ACME/settings/members');
      expect(p.settings.workflows).toBe('/projects/ACME/settings/workflows');
    });
  });

  describe('search()', () => {
    it('returns base search path without query', () => {
      expect(routes.search()).toBe('/search');
    });

    it('encodes the query parameter', () => {
      expect(routes.search('hello world')).toBe('/search?q=hello%20world');
    });
  });

  describe('admin', () => {
    it('builds user detail', () => {
      expect(routes.admin.users.detail('user-123')).toBe('/admin/users/user-123');
    });
  });

  describe('login()', () => {
    it('returns base login path', () => {
      expect(routes.login()).toBe('/login');
    });

    it('appends redirect param', () => {
      expect(routes.login({ redirect: '/dashboard' })).toBe('/login?redirect=%2Fdashboard');
    });

    it('appends error param', () => {
      expect(routes.login({ error: 'sso_failed' })).toBe('/login?error=sso_failed');
    });

    it('appends both params', () => {
      const result = routes.login({ redirect: '/dashboard', error: 'sso_failed' });
      expect(result).toBe('/login?redirect=%2Fdashboard&error=sso_failed');
    });
  });
});
