import type { CurrentUser } from '@/lib/stores/auth.store';
import type { PaginatedResponse } from '@repo/shared';
import type {
  Activity,
  Invite,
  IssueListItem,
  IssueDetail,
  IssueStatus,
  ProjectMember,
} from '@repo/shared/schemas';

let counter = 0;
function uid() {
  return `test-id-${++counter}`;
}

export function resetFactoryCounter() {
  counter = 0;
}

export function buildUser(overrides?: Partial<CurrentUser>): CurrentUser {
  const id = uid();
  return {
    id,
    email: `user-${id}@test.com`,
    name: `User ${id}`,
    avatarUrl: null,
    role: 'USER',
    ...overrides,
  };
}

export function buildIssueStatus(overrides?: Partial<IssueStatus>): IssueStatus {
  return {
    id: uid(),
    name: 'To Do',
    color: '#3b82f6',
    category: 'UNSTARTED',
    ...overrides,
  };
}

export function buildIssueListItem(overrides?: Partial<IssueListItem>): IssueListItem {
  const id = uid();
  return {
    id,
    number: counter,
    title: `Test Issue ${id}`,
    status: buildIssueStatus(),
    priority: 'MEDIUM',
    type: 'TASK',
    assignee: null,
    reporter: { id: uid(), name: 'Reporter', email: 'reporter@test.com', avatarUrl: null },
    tags: [],
    estimate: null,
    spent: 0,
    version: 1,
    commentsCount: 0,
    childrenCount: 0,
    sprintId: null,
    sprintName: null,
    dueDate: null,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildIssueDto(overrides?: Partial<IssueDetail>): IssueDetail {
  const base = buildIssueListItem(overrides);
  return {
    ...base,
    description: null,
    parent: null,
    children: [],
    watchers: [],
    isWatching: false,
    project: { id: uid(), key: 'PROJ', name: 'Project', color: '#6366f1' },
    ...overrides,
  };
}

export function buildInvite(overrides?: Partial<Invite>): Invite {
  return {
    id: uid(),
    email: `invitee-${uid()}@test.com`,
    role: 'USER',
    status: 'PENDING',
    invitedBy: { id: uid(), name: 'Inviter' },
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildActivity(overrides?: Partial<Activity>): Activity {
  return {
    id: uid(),
    issueId: uid(),
    type: 'STATUS_CHANGE',
    actor: { id: uid(), name: 'Actor', email: 'actor@test.com', avatarUrl: null },
    payload: { field: 'status', from: 'TODO', to: 'IN_PROGRESS' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function buildProjectMember(
  overrides?: Partial<ProjectMember> & { user?: Partial<ProjectMember['user']> },
): ProjectMember {
  const id = uid();
  return {
    user: {
      id,
      name: `Member ${id}`,
      email: `member-${id}@test.com`,
      avatarUrl: null,
      ...overrides?.user,
    },
    role: overrides?.role ?? { id: uid(), name: 'Developer', permissions: [] },
    joinedAt: overrides?.joinedAt ?? new Date().toISOString(),
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  metaOverrides?: Partial<PaginatedResponse<T>['meta']>,
): PaginatedResponse<T> {
  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      perPage: 20,
      totalPages: 1,
      ...metaOverrides,
    },
  };
}
