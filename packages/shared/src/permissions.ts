/**
 * Atomic permissions role system.
 * Each permission represents a single action a user can perform within a project.
 */
export const Permission = {
  // Issues
  ISSUE_READ: 'ISSUE_READ',
  ISSUE_CREATE: 'ISSUE_CREATE',
  ISSUE_UPDATE: 'ISSUE_UPDATE',
  ISSUE_DELETE: 'ISSUE_DELETE',
  ISSUE_MOVE: 'ISSUE_MOVE',
  ISSUE_LINK_MANAGE: 'ISSUE_LINK_MANAGE',

  // Comments
  COMMENT_CREATE: 'COMMENT_CREATE',
  COMMENT_EDIT_OWN: 'COMMENT_EDIT_OWN',

  // Knowledge Base
  ARTICLE_READ: 'ARTICLE_READ',
  ARTICLE_CREATE: 'ARTICLE_CREATE',
  ARTICLE_UPDATE: 'ARTICLE_UPDATE',
  ARTICLE_DELETE: 'ARTICLE_DELETE',

  // Project Configuration
  PROJECT_SETTINGS_UPDATE: 'PROJECT_SETTINGS_UPDATE',
  PROJECT_ARCHIVE: 'PROJECT_ARCHIVE',
  MEMBER_MANAGE: 'MEMBER_MANAGE',

  // Project Entities Management
  TAG_MANAGE: 'TAG_MANAGE',
  WORKFLOW_MANAGE: 'WORKFLOW_MANAGE',
  BOARD_MANAGE: 'BOARD_MANAGE',
  CUSTOM_FIELD_MANAGE: 'CUSTOM_FIELD_MANAGE',
  VERSION_MANAGE: 'VERSION_MANAGE',
  SPRINT_MANAGE: 'SPRINT_MANAGE',

  // Integrations & Automation
  WEBHOOK_MANAGE: 'WEBHOOK_MANAGE',
  TEAM_MANAGE: 'TEAM_MANAGE',
  AUTO_ASSIGN_MANAGE: 'AUTO_ASSIGN_MANAGE',
  WORKFLOW_RULE_MANAGE: 'WORKFLOW_RULE_MANAGE',

  // Time Tracking
  TIME_LOG_OWN: 'TIME_LOG_OWN',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

/**
 * Permission groups for the admin UI — checkboxes are grouped by category.
 */
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] =
  [
    {
      label: 'Issues',
      permissions: [
        Permission.ISSUE_READ,
        Permission.ISSUE_CREATE,
        Permission.ISSUE_UPDATE,
        Permission.ISSUE_DELETE,
        Permission.ISSUE_MOVE,
        Permission.ISSUE_LINK_MANAGE,
      ],
    },
    {
      label: 'Comments',
      permissions: [Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN],
    },
    {
      label: 'Knowledge Base',
      permissions: [
        Permission.ARTICLE_READ,
        Permission.ARTICLE_CREATE,
        Permission.ARTICLE_UPDATE,
        Permission.ARTICLE_DELETE,
      ],
    },
    {
      label: 'Project Configuration',
      permissions: [
        Permission.PROJECT_SETTINGS_UPDATE,
        Permission.PROJECT_ARCHIVE,
        Permission.MEMBER_MANAGE,
      ],
    },
    {
      label: 'Project Entities',
      permissions: [
        Permission.TAG_MANAGE,
        Permission.WORKFLOW_MANAGE,
        Permission.BOARD_MANAGE,
        Permission.CUSTOM_FIELD_MANAGE,
        Permission.VERSION_MANAGE,
        Permission.SPRINT_MANAGE,
      ],
    },
    {
      label: 'Integrations & Automation',
      permissions: [
        Permission.WEBHOOK_MANAGE,
        Permission.TEAM_MANAGE,
        Permission.AUTO_ASSIGN_MANAGE,
        Permission.WORKFLOW_RULE_MANAGE,
      ],
    },
    {
      label: 'Time Tracking',
      permissions: [Permission.TIME_LOG_OWN],
    },
  ];
