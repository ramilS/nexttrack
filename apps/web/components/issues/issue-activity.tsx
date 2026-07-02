'use client';

import { useState, useMemo } from 'react';
import { AsyncContent } from '@/components/shared/async-content';
import { RelativeTime } from '@/components/shared/relative-time';
import {
  ArrowRight,
  MessageSquare,
  Tag,
  UserPlus,
  Pencil,
  GitBranch,
} from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { LoadMoreButton } from '@/components/shared/load-more-button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommentList } from '@/components/comments/comment-list';
import { useIssueActivities } from '@/lib/hooks/use-issues';
import type { Activity } from '@repo/shared/schemas';
import { cn } from '@/lib/utils';

interface IssueActivityProps {
  projectKey: string;
  issueNumber: number;
  issueId: string;
  className?: string;
}

export function IssueActivity({ projectKey, issueNumber, issueId, className }: IssueActivityProps) {
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useIssueActivities(projectKey, issueNumber);

  const activities = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const handleTabChange = (value: string | number) => {
    setTab(value as 'comments' | 'activity');
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'comments' ? (
        <CommentList issueId={issueId} projectKey={projectKey} />
      ) : (
        <>
          <AsyncContent
            loading={isLoading}
            empty={activities.length === 0}
            emptyState={
              <p className="text-sm text-muted-foreground py-4 text-center">
                No activity yet
              </p>
            }
            className="py-8"
          >
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </AsyncContent>

          <LoadMoreButton
            onClick={() => fetchNextPage()}
            isLoading={isFetchingNextPage}
            hasNextPage={hasNextPage}
          />
        </>
      )}
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const { icon, text } = getActivityDisplay(activity);

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <UserAvatar
        user={activity.actor}
        size="sm"
        className="size-6 mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          {icon}
          <span className="font-medium">{activity.actor.name}</span>
          <span className="text-muted-foreground">{text}</span>
        </div>
        {activity.type === 'COMMENT_ADD' && typeof activity.payload.comment === 'string' && (
          <p className="mt-1.5 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            {activity.payload.comment}
          </p>
        )}
      </div>
      <RelativeTime date={activity.createdAt} className="text-xs text-muted-foreground whitespace-nowrap shrink-0" />
    </div>
  );
}

interface UserRef {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}

function formatUserRef(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const u = ref as Partial<UserRef>;
  return u.name ?? u.email ?? (typeof u.id === 'string' ? u.id : null);
}

type StatusRefShape = { id: string; name: string; category: string };

function asStatusRef(v: unknown): string | StatusRefShape | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'name' in v) {
    const obj = v as { id?: unknown; name?: unknown; category?: unknown };
    if (typeof obj.name !== 'string') return null;
    return {
      id: typeof obj.id === 'string' ? obj.id : '',
      name: obj.name,
      category: typeof obj.category === 'string' ? obj.category : '',
    };
  }
  return null;
}

function asStringOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function getActivityDisplay(activity: Activity): { icon: React.ReactNode; text: React.ReactNode } {
  const { type } = activity;
  const payload = activity.payload as Record<string, unknown>;

  switch (type) {
    case 'STATUS_CHANGE': {
      const from = asStatusRef(payload.from);
      const to = asStatusRef(payload.to);
      return {
        icon: <ArrowRight className="size-3 text-muted-foreground" />,
        text: (
          <span className="flex items-center gap-1.5">
            changed status
            {from && <StatusBadge status={from} />}
            <ArrowRight className="size-3 text-muted-foreground" />
            {to && <StatusBadge status={to} />}
          </span>
        ),
      };
    }

    case 'PRIORITY_CHANGE': {
      const from = typeof payload.from === 'string' ? payload.from : null;
      const to = typeof payload.to === 'string' ? payload.to : null;
      return {
        icon: <ArrowRight className="size-3 text-muted-foreground" />,
        text: (
          <span className="flex items-center gap-1.5">
            changed priority
            {from && <PriorityBadge priority={from} />}
            <ArrowRight className="size-3 text-muted-foreground" />
            {to && <PriorityBadge priority={to} />}
          </span>
        ),
      };
    }

    case 'ASSIGNEE_CHANGE': {
      const toName = formatUserRef(payload.to);
      return {
        icon: <UserPlus className="size-3 text-muted-foreground" />,
        text: toName ? `assigned to ${toName}` : 'unassigned',
      };
    }

    case 'TITLE_CHANGE':
      return {
        icon: <Pencil className="size-3 text-muted-foreground" />,
        text: 'updated the title',
      };

    case 'COMMENT_ADD':
      return {
        icon: <MessageSquare className="size-3 text-muted-foreground" />,
        text: 'commented',
      };

    case 'TAG_ADD':
      return {
        icon: <Tag className="size-3 text-muted-foreground" />,
        text: `added tag: ${asStringOrEmpty(payload.to)}`,
      };

    case 'TAG_REMOVE':
      return {
        icon: <Tag className="size-3 text-muted-foreground" />,
        text: `removed tag: ${asStringOrEmpty(payload.from)}`,
      };

    case 'SPRINT_CHANGE': {
      const to = asStringOrEmpty(payload.to);
      return {
        icon: <GitBranch className="size-3 text-muted-foreground" />,
        text: to ? `moved to ${to}` : 'removed from sprint',
      };
    }

    case 'ISSUE_CREATED':
      return {
        icon: <Pencil className="size-3 text-muted-foreground" />,
        text: 'created this issue',
      };

    case 'DESCRIPTION_CHANGE':
      return {
        icon: <Pencil className="size-3 text-muted-foreground" />,
        text: 'updated the description',
      };

    case 'FIELD_VALUE_CHANGE': {
      const field = asStringOrEmpty(payload.field) || 'field';
      const from = payload.from == null ? null : String(payload.from);
      const to = payload.to == null ? null : String(payload.to);
      let text: string;
      if (from && to) text = `changed ${field}: ${from} → ${to}`;
      else if (to) text = `set ${field} to ${to}`;
      else if (from) text = `cleared ${field} (was ${from})`;
      else text = `changed ${field}`;
      return {
        icon: <Pencil className="size-3 text-muted-foreground" />,
        text,
      };
    }

    default:
      return {
        icon: <Pencil className="size-3 text-muted-foreground" />,
        text: `${type.toLowerCase().replace(/_/g, ' ')}`,
      };
  }
}
