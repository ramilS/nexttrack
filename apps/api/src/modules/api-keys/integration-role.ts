import { Permission } from '@repo/shared';

export const INTEGRATION_ROLE_ID = '00000000-0000-0000-0000-000000000006';

/**
 * Default role for API-key service principals. Deliberately excludes
 * ISSUE_UPDATE: granting it would let any integration rewrite every field of
 * every issue. A deployment that wants reopen-on-recurrence assigns its service
 * user a custom role instead.
 */
export const INTEGRATION_ROLE = {
  id: INTEGRATION_ROLE_ID,
  name: 'Integration',
  description: 'Machine access: read issues, create issues, comment',
  permissions: [Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.COMMENT_CREATE],
  isSystem: true,
} as const;
