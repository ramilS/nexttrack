import { NotificationType } from '@prisma/client';
import type { PreferenceChannel } from '@repo/shared/schemas';

/** Every channel a notification type can reach — user preference channels plus
 *  the async delivery integrations. */
export type NotificationChannel = PreferenceChannel | 'webhook' | 'telegram';

export interface NotificationTypeMeta {
  type: NotificationType;
  label: string;
  description: string;
  channels: NotificationChannel[];
}

export const NOTIFICATION_TYPES_META: NotificationTypeMeta[] = [
  {
    type: NotificationType.ISSUE_ASSIGNED,
    label: 'Issue assigned',
    description: 'When an issue is assigned to you',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.STATUS_CHANGE,
    label: 'Status changed',
    description: 'When an issue status changes',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.COMMENT_ADD,
    label: 'New comment',
    description: 'When a comment is added to a watched issue',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.MENTION,
    label: 'Mentioned',
    description: 'When you are mentioned in a comment',
    channels: ['inApp', 'email'],
  },
  {
    type: NotificationType.ISSUE_RESOLVED,
    label: 'Issue resolved',
    description: 'When a watched issue is resolved',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.DUE_DATE,
    label: 'Due date approaching',
    description: 'When an issue due date is within 24 hours',
    channels: ['inApp', 'email'],
  },
  {
    type: NotificationType.SPRINT_STARTED,
    label: 'Sprint started',
    description: 'When a sprint is started',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.SPRINT_CLOSED,
    label: 'Sprint closed',
    description: 'When a sprint is closed',
    channels: ['inApp', 'email', 'webhook', 'telegram'],
  },
  {
    type: NotificationType.ADDED_TO_PROJECT,
    label: 'Added to project',
    description: 'When you are added to a project',
    channels: ['inApp', 'email'],
  },
  {
    type: NotificationType.INVITE_ACCEPTED,
    label: 'Invite accepted',
    description: 'When someone accepts your invitation',
    channels: ['inApp', 'email'],
  },
];
