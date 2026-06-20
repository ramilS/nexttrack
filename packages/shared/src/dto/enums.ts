/** Activity type — matches Prisma ActivityType enum. */
export type ActivityType =
  | 'STATUS_CHANGE'
  | 'ASSIGNEE_CHANGE'
  | 'PRIORITY_CHANGE'
  | 'TYPE_CHANGE'
  | 'TITLE_CHANGE'
  | 'DESCRIPTION_CHANGE'
  | 'TAG_ADD'
  | 'TAG_REMOVE'
  | 'COMMENT_ADD'
  | 'COMMENT_EDIT'
  | 'COMMENT_DELETE'
  | 'ATTACHMENT_ADD'
  | 'ATTACHMENT_DELETE'
  | 'SPRINT_CHANGE'
  | 'ESTIMATE_CHANGE'
  | 'DUE_DATE_CHANGE'
  | 'PARENT_CHANGE'
  | 'WATCHER_ADD'
  | 'WATCHER_REMOVE'
  | 'ISSUE_CREATED'
  | 'ISSUE_DELETED'
  | 'ISSUE_RESTORED'
  | 'FIELD_VALUE_CHANGE'
  | 'TIME_LOG_ADD'
  | 'TIME_LOG_EDIT';

/** Invite status — matches Prisma InviteStatus enum. */
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
