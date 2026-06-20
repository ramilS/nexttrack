import { GlobalRole, IssueType, Priority, IssueLinkType } from '@prisma/client';
import { ALL_PERMISSIONS, Permission } from '../../../../packages/shared/src/permissions';

let counter = 0;
const nextId = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`;

export function buildUser(overrides?: Record<string, unknown>) {
  const id = nextId();
  return {
    id,
    email: `user-${id}@test.local`,
    name: `User ${id}`,
    passwordHash: '$2b$12$hashedpassword',
    hasPassword: true,
    role: GlobalRole.USER,
    avatarUrl: null,
    isBlocked: false,
    blockReason: null,
    blockedAt: null,
    blockedById: null,
    deletedAt: null,
    deletedById: null,
    migratedFrom: null,
    ytId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function buildRefreshToken(overrides?: Record<string, unknown>) {
  return {
    id: nextId(),
    userId: nextId(),
    token: '$2b$12$hashedtoken',
    userAgent: 'jest',
    ipAddress: '127.0.0.1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

export function buildInvite(overrides?: Record<string, unknown>) {
  return {
    id: nextId(),
    email: `invite-${Date.now()}@test.local`,
    token: '550e8400-e29b-41d4-a716-446655440000',
    role: GlobalRole.USER,
    status: 'PENDING' as const,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    acceptedAt: null,
    acceptedBy: null,
    senderId: nextId(),
    createdAt: new Date(),
    ...overrides,
  };
}

export function buildProject(overrides?: Record<string, unknown>) {
  const id = nextId();
  return {
    id,
    key: `PRJ${counter}`,
    name: `Project ${id}`,
    description: null,
    iconUrl: null,
    color: null,
    isPrivate: false,
    isArchived: false,
    archivedAt: null,
    archivedById: null,
    deletedAt: null,
    deletedById: null,
    createdById: nextId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function buildRole(overrides?: Record<string, unknown>) {
  return {
    id: nextId(),
    name: 'Developer',
    description: 'Default test role',
    permissions: [
      Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE,
      Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE,
      Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE,
      Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN,
    ],
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function buildProjectAdminRole(overrides?: Record<string, unknown>) {
  return buildRole({
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Project Admin',
    description: 'Full access',
    permissions: ALL_PERMISSIONS,
    ...overrides,
  });
}

export function buildProjectMember(overrides?: Record<string, unknown>) {
  const roleId =
    typeof overrides?.roleId === 'string' ? overrides.roleId : nextId();
  return {
    userId: nextId(),
    projectId: nextId(),
    roleId,
    joinedAt: new Date(),
    invitedBy: null,
    roleRef: overrides?.roleRef ?? buildRole({ id: roleId }),
    ...overrides,
  };
}

export function buildIssue(overrides?: Record<string, unknown>) {
  const id = nextId();
  return {
    id,
    number: counter,
    title: `Issue ${id}`,
    description: null,
    type: IssueType.TASK,
    priority: Priority.MEDIUM,
    statusId: 'status-open',
    projectId: nextId(),
    reporterId: nextId(),
    assigneeId: null,
    parentId: null,
    sprintId: null,
    estimate: null,
    spent: 0,
    version: 1,
    dueDate: null,
    startDate: null,
    resolvedAt: null,
    deletedAt: null,
    deletedById: null,
    ytId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function buildIssueLink(overrides?: Record<string, unknown>) {
  return {
    id: nextId(),
    type: IssueLinkType.RELATES_TO,
    sourceIssueId: nextId(),
    targetIssueId: nextId(),
    createdById: nextId(),
    createdAt: new Date(),
    ...overrides,
  };
}

export function resetFactoryCounter() {
  counter = 0;
}
