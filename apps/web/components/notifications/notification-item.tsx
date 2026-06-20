'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RelativeTime } from '@/components/shared/relative-time';
import {
  UserPlus,
  MessageSquare,
  ArrowRight,
  AtSign,
  CheckCircle2,
  Calendar,
  Play,
  Flag,
  FolderPlus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMarkAsRead } from '@/lib/hooks/use-notifications';
import type { NotificationDto } from '@/lib/api/notifications.api';

interface NotificationItemProps {
  notification: NotificationDto;
  compact?: boolean;
}

interface NotificationInfo {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  description?: string;
  link: string;
}

function getNotificationInfo(n: NotificationDto): NotificationInfo {
  const p = n.payload as Record<string, string>;
  const issueLink = p.projectKey && p.issueNumber
    ? `/projects/${p.projectKey}/issues/${p.issueNumber}`
    : '#';

  switch (n.type) {
    case 'ISSUE_ASSIGNED':
      return {
        icon: UserPlus,
        iconClassName: 'text-info',
        title: `${p.actorName} assigned ${p.issueKey} to you`,
        description: p.issueTitle,
        link: issueLink,
      };
    case 'COMMENT_ADD':
      return {
        icon: MessageSquare,
        iconClassName: 'text-success',
        title: `${p.actorName} commented on ${p.issueKey}`,
        description: p.commentPreview,
        link: issueLink,
      };
    case 'STATUS_CHANGE':
      return {
        icon: ArrowRight,
        iconClassName: 'text-warning',
        title: `${p.issueKey} status changed`,
        description: `${p.fromStatus} → ${p.toStatus}`,
        link: issueLink,
      };
    case 'MENTION':
      return {
        icon: AtSign,
        iconClassName: 'text-status-in-review',
        title: `${p.actorName} mentioned you in ${p.issueKey}`,
        description: p.issueTitle,
        link: issueLink,
      };
    case 'ISSUE_RESOLVED':
      return {
        icon: CheckCircle2,
        iconClassName: 'text-success',
        title: `${p.issueKey} resolved`,
        description: p.issueTitle,
        link: issueLink,
      };
    case 'DUE_DATE':
      return {
        icon: Calendar,
        iconClassName: 'text-destructive',
        title: `${p.issueKey} is due soon`,
        description: p.issueTitle,
        link: issueLink,
      };
    case 'SPRINT_STARTED':
      return {
        icon: Play,
        iconClassName: 'text-primary',
        title: `Sprint "${p.sprintName}" started`,
        link: p.projectKey ? `/projects/${p.projectKey}/board` : '#',
      };
    case 'SPRINT_CLOSED':
      return {
        icon: Flag,
        iconClassName: 'text-primary',
        title: `Sprint "${p.sprintName}" completed`,
        link: p.projectKey ? `/projects/${p.projectKey}/board` : '#',
      };
    case 'ADDED_TO_PROJECT':
      return {
        icon: FolderPlus,
        iconClassName: 'text-primary',
        title: `You were added to project ${p.projectKey}`,
        link: p.projectKey ? `/projects/${p.projectKey}/issues` : '#',
      };
    default:
      return {
        icon: ArrowRight,
        iconClassName: 'text-muted-foreground',
        title: 'New notification',
        link: '#',
      };
  }
}

export function NotificationItem({ notification, compact }: NotificationItemProps) {
  const info = useMemo(() => getNotificationInfo(notification), [notification]);
  const markAsRead = useMarkAsRead();

  function handleClick() {
    if (!notification.isRead) {
      markAsRead.mutate([notification.id]);
    }
  }

  return (
    <Link
      href={info.link}
      onClick={handleClick}
      className={cn(
        'flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors',
        !notification.isRead && 'bg-primary/5',
        compact && 'px-3 py-2',
      )}
    >
      <div className="mt-0.5 shrink-0">
        {!notification.isRead ? (
          <div className="relative">
            <info.icon className={cn('size-4', info.iconClassName)} />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
          </div>
        ) : (
          <info.icon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', !notification.isRead && 'font-medium')}>{info.title}</p>
        {info.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{info.description}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          <RelativeTime date={notification.createdAt} className="text-[11px]" />
        </p>
      </div>
    </Link>
  );
}
