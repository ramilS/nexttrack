import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Permission, GlobalRole } from '@repo/shared';
import type { Project } from '@repo/shared/schemas';
import { useHasPermission, useHasAnyPermission } from './use-permission';

const useProjectContextMock = vi.fn<() => Project>();
let mockAuthUser: { role: `${GlobalRole}` } | null = null;

vi.mock('@/lib/contexts/project.context', () => ({
  useProjectContext: () => useProjectContextMock(),
}));

vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockAuthUser }) => unknown) =>
    selector({ user: mockAuthUser }),
}));

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    key: 'TEST',
    name: 'Test Project',
    description: null,
    color: '#000000',
    iconUrl: null,
    isPrivate: false,
    isArchived: false,
    membersCount: 1,
    myRole: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Developer',
      permissions: [],
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setRolePermissions(permissions: string[] | null): void {
  useProjectContextMock.mockReturnValue(
    buildProject({
      myRole:
        permissions === null
          ? null
          : {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'Developer',
              permissions,
            },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = null;
});

describe('useHasPermission', () => {
  it('returns true when the role includes the required permission', () => {
    setRolePermissions([Permission.ISSUE_CREATE, Permission.ISSUE_READ]);

    const { result } = renderHook(() => useHasPermission(Permission.ISSUE_CREATE));

    expect(result.current).toBe(true);
  });

  it('returns false when the role does not include the required permission', () => {
    setRolePermissions([Permission.ISSUE_READ]);

    const { result } = renderHook(() => useHasPermission(Permission.ISSUE_DELETE));

    expect(result.current).toBe(false);
  });

  it('denies by default when myRole is null (?? false fallback)', () => {
    setRolePermissions(null);

    const { result } = renderHook(() => useHasPermission(Permission.ISSUE_CREATE));

    expect(result.current).toBe(false);
  });

  it('returns false for an empty permissions array', () => {
    setRolePermissions([]);

    const { result } = renderHook(() => useHasPermission(Permission.ISSUE_CREATE));

    expect(result.current).toBe(false);
  });

  it('does NOT grant a blanket bypass for high-privilege role names', () => {
    // The web hooks have no admin bypass: only the explicit permissions array counts.
    // A role named "Project Admin" with an empty permission set must still be denied.
    useProjectContextMock.mockReturnValue(
      buildProject({
        myRole: {
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Project Admin',
          permissions: [],
        },
      }),
    );

    const { result } = renderHook(() => useHasPermission(Permission.PROJECT_SETTINGS_UPDATE));

    expect(result.current).toBe(false);
  });

  it('bypasses the project role check for a global admin with no project membership', () => {
    // Mirrors PermissionGuard's `req.user.role === GlobalRole.ADMIN` bypass —
    // an admin who isn't an explicit project member still sees myRole === null.
    mockAuthUser = { role: GlobalRole.ADMIN };
    setRolePermissions(null);

    const { result } = renderHook(() => useHasPermission(Permission.TAG_MANAGE));

    expect(result.current).toBe(true);
  });

  it('bypasses the project role check for a global admin even with a permission-less role', () => {
    mockAuthUser = { role: GlobalRole.ADMIN };
    setRolePermissions([]);

    const { result } = renderHook(() => useHasPermission(Permission.CUSTOM_FIELD_MANAGE));

    expect(result.current).toBe(true);
  });

  it('does not bypass for a non-admin global role', () => {
    mockAuthUser = { role: GlobalRole.USER };
    setRolePermissions(null);

    const { result } = renderHook(() => useHasPermission(Permission.TAG_MANAGE));

    expect(result.current).toBe(false);
  });
});

describe('useHasAnyPermission', () => {
  it('returns true when at least one required permission is present (OR semantics)', () => {
    setRolePermissions([Permission.ISSUE_READ]);

    const { result } = renderHook(() =>
      useHasAnyPermission([Permission.ISSUE_CREATE, Permission.ISSUE_READ]),
    );

    expect(result.current).toBe(true);
  });

  it('returns false when none of the required permissions are present', () => {
    setRolePermissions([Permission.ARTICLE_READ]);

    const { result } = renderHook(() =>
      useHasAnyPermission([Permission.ISSUE_CREATE, Permission.ISSUE_DELETE]),
    );

    expect(result.current).toBe(false);
  });

  it('uses OR semantics, not AND — one match is enough even if others are missing', () => {
    setRolePermissions([Permission.COMMENT_CREATE]);

    const { result } = renderHook(() =>
      useHasAnyPermission([
        Permission.COMMENT_CREATE,
        Permission.ISSUE_DELETE,
        Permission.WEBHOOK_MANAGE,
      ]),
    );

    expect(result.current).toBe(true);
  });

  it('returns false for an empty required-permissions array (Array.some on []) ', () => {
    setRolePermissions([Permission.ISSUE_CREATE, Permission.ISSUE_READ]);

    const { result } = renderHook(() => useHasAnyPermission([]));

    expect(result.current).toBe(false);
  });

  it('denies by default when myRole is null (?? [] fallback)', () => {
    setRolePermissions(null);

    const { result } = renderHook(() =>
      useHasAnyPermission([Permission.ISSUE_CREATE, Permission.ISSUE_READ]),
    );

    expect(result.current).toBe(false);
  });

  it('returns false when role permissions are empty and some are required', () => {
    setRolePermissions([]);

    const { result } = renderHook(() =>
      useHasAnyPermission([Permission.ISSUE_CREATE]),
    );

    expect(result.current).toBe(false);
  });

  it('bypasses the project role check for a global admin with no project membership', () => {
    mockAuthUser = { role: GlobalRole.ADMIN };
    setRolePermissions(null);

    const { result } = renderHook(() =>
      useHasAnyPermission([Permission.TAG_MANAGE, Permission.CUSTOM_FIELD_MANAGE]),
    );

    expect(result.current).toBe(true);
  });
});
