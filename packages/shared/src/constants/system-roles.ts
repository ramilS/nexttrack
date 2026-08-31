import { ALL_PERMISSIONS, Permission } from '../permissions';

/**
 * Reserved ids for the seeded system roles. They are synthetic (not RFC 9562
 * UUIDs) — schemas that accept them must use `z.guid()`, not `z.uuid()`.
 */
export const SYSTEM_ROLE_IDS = {
  PROJECT_ADMIN: '00000000-0000-0000-0000-000000000001',
  DEVELOPER: '00000000-0000-0000-0000-000000000002',
  QA: '00000000-0000-0000-0000-000000000003',
  REPORTER: '00000000-0000-0000-0000-000000000004',
  OBSERVER: '00000000-0000-0000-0000-000000000005',
  INTEGRATION: '00000000-0000-0000-0000-000000000006',
} as const;

export interface SystemRoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/**
 * The single definition of the seeded system roles. `prisma/seed.ts` writes
 * these to a real database and the integration harness seeds the same set, so
 * a test can never pass against a role table production would not produce.
 * Keeping two copies is what previously let the Integration role exist in the
 * seed but not in tests.
 */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    id: SYSTEM_ROLE_IDS.PROJECT_ADMIN,
    name: 'Project Admin',
    description: 'Full access to all project features and settings',
    permissions: ALL_PERMISSIONS,
  },
  {
    id: SYSTEM_ROLE_IDS.DEVELOPER,
    name: 'Developer',
    description:
      'Full issue management, comments, articles, tags, boards, and time tracking',
    permissions: [
      Permission.ISSUE_READ,
      Permission.ISSUE_CREATE,
      Permission.ISSUE_UPDATE,
      Permission.ISSUE_DELETE,
      Permission.ISSUE_MOVE,
      Permission.ISSUE_LINK_MANAGE,
      Permission.COMMENT_CREATE,
      Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ,
      Permission.ARTICLE_CREATE,
      Permission.ARTICLE_UPDATE,
      Permission.TAG_MANAGE,
      Permission.BOARD_MANAGE,
      Permission.SPRINT_MANAGE,
      Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: SYSTEM_ROLE_IDS.QA,
    name: 'QA',
    description: 'Same as Developer, without tag and board management',
    permissions: [
      Permission.ISSUE_READ,
      Permission.ISSUE_CREATE,
      Permission.ISSUE_UPDATE,
      Permission.ISSUE_DELETE,
      Permission.ISSUE_MOVE,
      Permission.ISSUE_LINK_MANAGE,
      Permission.COMMENT_CREATE,
      Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ,
      Permission.ARTICLE_CREATE,
      Permission.ARTICLE_UPDATE,
      Permission.SPRINT_MANAGE,
      Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: SYSTEM_ROLE_IDS.REPORTER,
    name: 'Reporter',
    description:
      'Can create issues and comments, read articles, and log own time',
    permissions: [
      Permission.ISSUE_READ,
      Permission.ISSUE_CREATE,
      Permission.COMMENT_CREATE,
      Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ,
      Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: SYSTEM_ROLE_IDS.OBSERVER,
    name: 'Observer',
    description: 'Read-only access to issues and articles',
    permissions: [Permission.ISSUE_READ, Permission.ARTICLE_READ],
  },
  {
    // Default role for API-key service principals. Deliberately excludes
    // ISSUE_UPDATE: granting it would let any integration rewrite every field
    // of every issue. A deployment that wants reopen-on-recurrence assigns its
    // service user a custom role instead.
    id: SYSTEM_ROLE_IDS.INTEGRATION,
    name: 'Integration',
    description: 'Machine access: read issues, create issues, comment',
    permissions: [
      Permission.ISSUE_READ,
      Permission.ISSUE_CREATE,
      Permission.COMMENT_CREATE,
    ],
  },
];
