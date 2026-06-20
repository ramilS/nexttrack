import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import type { InviteValidation } from '@repo/shared/schemas';
import AcceptInvitePage from './page';

const mockPush = vi.fn();
const mockMutate = vi.fn();
let mockGetInviteResult: Promise<{ data: InviteValidation }>;

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'test-token' }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/api/auth.api', () => ({
  authApi: {
    getInvite: () => mockGetInviteResult,
  },
}));

vi.mock('@/lib/hooks/use-auth', () => ({
  useAcceptInvite: () => ({ mutate: mockMutate, isPending: false, error: null }),
}));

function resolveInvite(value: InviteValidation): void {
  mockGetInviteResult = Promise.resolve({ data: value });
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the accept form for a valid invite', async () => {
    resolveInvite({ valid: true, email: 'invitee@test.local', inviterName: 'Admin' });

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Accept Invitation')).toBeInTheDocument();
    expect(
      screen.getByText('Admin invited you to join NextTrack'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('submits the entered name and password for a valid invite', async () => {
    resolveInvite({ valid: true, email: 'invitee@test.local', inviterName: 'Admin' });

    render(<AcceptInvitePage />);
    await screen.findByText('Accept Invitation');

    await userEvent.type(screen.getByLabelText('Your Name'), 'New User');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Join NextTrack' }));

    expect(mockMutate).toHaveBeenCalledWith({
      token: 'test-token',
      name: 'New User',
      password: 'Password123!',
    });
  });

  it('shows the "already used" message with a login CTA for a used invite', async () => {
    resolveInvite({ valid: false, reason: 'used' });

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Invitation already used')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to login' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('shows the expired message (no login CTA) for an expired invite', async () => {
    resolveInvite({ valid: false, reason: 'expired' });

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Invitation expired')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Go to login' }),
    ).not.toBeInTheDocument();
  });

  it('shows the revoked message for a revoked invite', async () => {
    resolveInvite({ valid: false, reason: 'revoked' });

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Invitation revoked')).toBeInTheDocument();
  });

  it('shows the invalid message for an invalid invite', async () => {
    resolveInvite({ valid: false, reason: 'invalid' });

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Invalid invitation')).toBeInTheDocument();
  });

  it('falls back to the invalid message when the validation request fails', async () => {
    mockGetInviteResult = Promise.reject(new Error('network down'));

    render(<AcceptInvitePage />);

    expect(await screen.findByText('Invalid invitation')).toBeInTheDocument();
  });
});
