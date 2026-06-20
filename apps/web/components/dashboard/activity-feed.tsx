'use client';

import { RelativeTime } from '@/components/shared/relative-time';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  ArrowRightLeft,
  UserPlus,
  Plus,
  CheckCircle2,
  Bell,
  Clock,
  AtSign,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/lib/hooks/use-notifications';
import type { NotificationDto } from '@/lib/api/notifications.api';

const NOTIFICATION_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  COMMENT_ADD: { icon: MessageSquare, className: 'text-info bg-info/10' },
  STATUS_CHANGE: { icon: ArrowRightLeft, className: 'text-warning bg-warning/10' },
  ISSUE_ASSIGNED: { icon: UserPlus, className: 'text-primary bg-primary/10' },
  ISSUE_RESOLVED: { icon: CheckCircle2, className: 'text-success bg-success/10' },
  MENTION: { icon: AtSign, className: 'text-primary bg-primary/10' },
  SPRINT_STARTED: { icon: Plus, className: 'text-success bg-success/10' },
  SPRINT_CLOSED: { icon: Calendar, className: 'text-muted-foreground bg-muted' },
  DUE_DATE: { icon: Clock, className: 'text-warning bg-warning/10' },
  ADDED_TO_PROJECT: { icon: UserPlus, className: 'text-primary bg-primary/10' },
};

const DEFAULT_ICON = { icon: Bell, className: 'text-muted-foreground bg-muted' };

function getNotificationText(n: NotificationDto): string {
  const p = n.payload as Record<string, string>;
  switch (n.type) {
    case 'ISSUE_ASSIGNED':
      return `${p.actorName ?? 'Someone'} assigned ${p.issueKey ?? 'an issue'} to you`;
    case 'COMMENT_ADD':
      return `${p.actorName ?? 'Someone'} commented on ${p.issueKey ?? 'an issue'}`;
    case 'STATUS_CHANGE':
      return `${p.issueKey ?? 'Issue'} moved ${p.fromStatus ?? ''} → ${p.toStatus ?? ''}`;
    case 'MENTION':
      return `${p.actorName ?? 'Someone'} mentioned you in ${p.issueKey ?? 'an issue'}`;
    case 'ISSUE_RESOLVED':
      return `${p.issueKey ?? 'Issue'} resolved`;
    case 'SPRINT_STARTED':
      return `Sprint "${p.sprintName ?? ''}" started`;
    case 'SPRINT_CLOSED':
      return `Sprint "${p.sprintName ?? ''}" completed`;
    case 'ADDED_TO_PROJECT':
      return `You were added to project ${p.projectKey ?? ''}`;
    case 'DUE_DATE':
      return `${p.issueKey ?? 'Issue'} is due soon`;
    default:
      return 'New notification';
  }
}

export function ActivityFeed() {
  const { data, isLoading } = useNotifications({ pageSize: 8 });
  const notifications = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Recent Activity</h2>
      <Card className="gap-0 py-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent activity.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NotificationRow({ notification }: { notification: NotificationDto }) {
  const config = NOTIFICATION_ICON[notification.type] ?? DEFAULT_ICON;
  const Icon = config.icon;
  const text = getNotificationText(notification);

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', !notification.isRead && 'bg-primary/5')}>
      <div className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', config.className)}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{text}</p>
        <div className="mt-0.5">
          <RelativeTime date={notification.createdAt} />
        </div>
      </div>
    </div>
  );
}
