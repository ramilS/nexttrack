import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import type { User, UserMembership } from '@repo/shared/schemas';
import AdminUserDetailPage from './page';

const PROJECT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';
const DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';

let mockMemberships: UserMembership[] = [];

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-users', () => ({
  useUser: () => ({
    data: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Project User',
      avatarUrl: null,
      role: 'USER',
      isBlocked: false,
      blockedAt: null,
      blockReason: null,
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies User,
    isLoading: false,
  }),
  useUserMemberships: () => ({ data: mockMemberships, isLoading: false }),
  useAdminUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUserMembershipRole: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-roles', () => ({
  useRoles: () => ({
    data: [
      { id: PROJECT_ADMIN_ROLE_ID, name: 'Project Admin', permissions: [] },
      { id: DEVELOPER_ROLE_ID, name: 'Developer', permissions: [] },
    ],
  }),
}));

vi.mock('date-fns', () => ({ format: () => 'January 1, 2026' }));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: ({ children }: { children: (value: string | null) => React.ReactNode }) => (
    <>{children(DEVELOPER_ROLE_ID)}</>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('@/components/shared/user-avatar', () => ({ UserAvatar: () => null }));
vi.mock('@/components/shared/color-dot', () => ({ ColorDot: () => null }));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

describe('AdminUserDetailPage project memberships', () => {
  beforeEach(() => {
    mockMemberships = [
      {
        project: {
          id: 'project-protected',
          key: 'PROTECTED',
          name: 'Protected Project',
          color: '#6366f1',
        },
        role: { id: PROJECT_ADMIN_ROLE_ID, name: 'Project Admin', permissions: [] },
        canChangeRole: false,
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        project: {
          id: 'project-editable',
          key: 'EDITABLE',
          name: 'Editable Project',
          color: '#6366f1',
        },
        role: { id: DEVELOPER_ROLE_ID, name: 'Developer', permissions: [] },
        canChangeRole: true,
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
  });

  it('shows a protected badge for the last Project Admin and a select for editable memberships', () => {
    render(<AdminUserDetailPage />);

    expect(screen.getByText('Project Admin')).toBeInTheDocument();
    expect(
      screen.getByText('Assign another Project Admin before changing this role.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Project role for Editable Project')).toBeInTheDocument();
    expect(screen.queryByLabelText('Project role for Protected Project')).not.toBeInTheDocument();
  });
});
