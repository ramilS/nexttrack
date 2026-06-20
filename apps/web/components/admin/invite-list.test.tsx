import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { buildInvite, resetFactoryCounter } from '@/test/factories';
import { InviteList } from './invite-list';
import type { Invite } from '@repo/shared/schemas';

let mockInvites: Invite[] = [];

vi.mock('@/lib/hooks/use-users', () => ({
  useInvites: () => ({ data: mockInvites, isLoading: false }),
  useResendInvite: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('InviteList', () => {
  beforeEach(() => {
    resetFactoryCounter();
    mockInvites = [];
  });

  // GET /users/invites returns a bare Invite[] (no pagination envelope); the
  // component must read the array directly, not data.items. Regression guard
  // for the contract-sweep fix where web wrongly expected PaginatedResponse.
  it('renders a row per invite from a bare array response', () => {
    mockInvites = [
      buildInvite({ email: 'alice@test.com' }),
      buildInvite({ email: 'bob@test.com' }),
    ];

    render(<InviteList />);

    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.queryByText('No pending invites.')).not.toBeInTheDocument();
  });

  it('shows the empty state when the array is empty', () => {
    mockInvites = [];

    render(<InviteList />);

    expect(screen.getByText('No pending invites.')).toBeInTheDocument();
  });
});
