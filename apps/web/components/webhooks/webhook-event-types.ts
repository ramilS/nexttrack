import type { WebhookEventType } from '@repo/shared/schemas';

interface WebhookEventTypeMeta {
  value: WebhookEventType;
  label: string;
  description: string;
}

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventTypeMeta[] = [
  { value: 'ASSIGNEE_CHANGED', label: 'Assignee changed', description: 'When an issue is assigned or reassigned' },
  { value: 'STATUS_CHANGED', label: 'Status changed', description: 'When an issue status is updated' },
  { value: 'COMMENT_ADDED', label: 'New comment', description: 'When a comment is added to an issue' },
  { value: 'ISSUE_RESOLVED', label: 'Issue resolved', description: 'When an issue is marked as resolved' },
  { value: 'SPRINT_STARTED', label: 'Sprint started', description: 'When a sprint is started' },
  { value: 'SPRINT_CLOSED', label: 'Sprint closed', description: 'When a sprint is closed' },
];
