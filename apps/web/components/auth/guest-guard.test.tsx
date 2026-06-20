import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { GuestGuard } from './guest-guard';
import type { CurrentUser } from '@/lib/stores/auth.store';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/hooks/use-auth', () => ({
  useCurrentUser: () => mockCurrentUser,
}));

let mockCurrentUser: {
  data: CurrentUser | undefined;
  isLoading: boolean;
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

const GUEST_TEXT = 'login form';

function renderGuard() {
  return render(
    <GuestGuard>
      <div>{GUEST_TEXT}</div>
    </GuestGuard>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser = { data: undefined, isLoading: false };
});

describe('GuestGuard', () => {
  describe('when authenticated', () => {
    beforeEach(() => {
      mockCurrentUser = { data: buildUser(), isLoading: false };
    });

    it('redirects authenticated users to /dashboard', () => {
      renderGuard();
      expect(replace).toHaveBeenCalledWith('/dashboard');
    });

    it('does not render guest children (no flash of the login form)', () => {
      renderGuard();
      expect(screen.queryByText(GUEST_TEXT)).not.toBeInTheDocument();
    });

    it('shows the loader spinner while redirecting', () => {
      const { container } = renderGuard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('when unauthenticated', () => {
    beforeEach(() => {
      mockCurrentUser = { data: undefined, isLoading: false };
    });

    it('renders the guest children', () => {
      renderGuard();
      expect(screen.getByText(GUEST_TEXT)).toBeInTheDocument();
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

  describe('while loading', () => {
    beforeEach(() => {
      mockCurrentUser = { data: undefined, isLoading: true };
    });

    it('shows the loader spinner', () => {
      const { container } = renderGuard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('does not render guest children', () => {
      renderGuard();
      expect(screen.queryByText(GUEST_TEXT)).not.toBeInTheDocument();
    });

    it('does not redirect while still loading', () => {
      renderGuard();
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
