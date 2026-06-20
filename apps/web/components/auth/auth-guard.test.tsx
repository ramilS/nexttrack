import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AuthGuard } from './auth-guard';
import type { CurrentUser } from '@/lib/stores/auth.store';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock('@/lib/hooks/use-auth', () => ({
  useCurrentUser: () => mockCurrentUser,
}));

let mockPathname = '/dashboard';
let mockSearch = '';
let mockCurrentUser: {
  data: CurrentUser | undefined;
  isLoading: boolean;
  isError: boolean;
};

function buildUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    role: 'USER',
    ...overrides,
  };
}

const PROTECTED_TEXT = 'protected content';

function renderGuard() {
  return render(
    <AuthGuard>
      <div>{PROTECTED_TEXT}</div>
    </AuthGuard>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = '/dashboard';
  mockSearch = '';
  mockCurrentUser = { data: undefined, isLoading: false, isError: false };
});

describe('AuthGuard', () => {
  describe('while loading', () => {
    beforeEach(() => {
      mockCurrentUser = { data: undefined, isLoading: true, isError: false };
    });

    it('shows the loader spinner', () => {
      const { container } = renderGuard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('does not render protected children (no flash)', () => {
      renderGuard();
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });

    it('does not redirect while still loading', () => {
      renderGuard();
      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe('when unauthenticated (no user, no error)', () => {
    beforeEach(() => {
      mockCurrentUser = { data: undefined, isLoading: false, isError: false };
    });

    it('redirects to /login preserving pathname as ?redirect=', () => {
      mockPathname = '/projects/PROJ/board';
      renderGuard();
      expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fprojects%2FPROJ%2Fboard');
    });

    it('preserves pathname AND query string in the redirect param', () => {
      mockPathname = '/projects/PROJ/issues';
      mockSearch = 'status=open&page=2';
      renderGuard();
      expect(replace).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/projects/PROJ/issues?status=open&page=2')}`,
      );
    });

    it('does not render protected children', () => {
      renderGuard();
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });

    it('shows the loader spinner while redirecting', () => {
      const { container } = renderGuard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('when the current-user query errors', () => {
    beforeEach(() => {
      mockCurrentUser = { data: undefined, isLoading: false, isError: true };
    });

    it('redirects to /login preserving the pathname', () => {
      mockPathname = '/my-issues';
      renderGuard();
      expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fmy-issues');
    });

    it('does not render protected children', () => {
      renderGuard();
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });
  });

  describe('when authenticated', () => {
    beforeEach(() => {
      mockCurrentUser = { data: buildUser(), isLoading: false, isError: false };
    });

    it('renders the protected children', () => {
      renderGuard();
      expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    });

    it('does not redirect', () => {
      renderGuard();
      expect(replace).not.toHaveBeenCalled();
    });

    it('does not show the loader spinner', () => {
      const { container } = renderGuard();
      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    });
  });
});
