'use client';

import { useState, useMemo } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  useNotifications,
  useMarkAllAsRead,
  useUnreadCount,
} from '@/lib/hooks/use-notifications';
import { NotificationItem } from './notification-item';
import type { NotificationListParams } from '@/lib/api/notifications.api';

export function NotificationList() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const params: Omit<NotificationListParams, 'page'> = filter === 'unread' ? { isRead: false } : {};
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(params);
  const { data: unreadCount } = useUnreadCount();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.pages.flatMap((p) => p.items) ?? [];

  const groups = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayItems: typeof items = [];
    const yesterdayItems: typeof items = [];
    const olderItems: typeof items = [];

    for (const n of items) {
      const d = new Date(n.createdAt);
      if (d >= today) todayItems.push(n);
      else if (d >= yesterday) yesterdayItems.push(n);
      else olderItems.push(n);
    }

    const result: { label: string; items: typeof items }[] = [];
    if (todayItems.length) result.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length) result.push({ label: 'Yesterday', items: yesterdayItems });
    if (olderItems.length) result.push({ label: 'Earlier', items: olderItems });
    return result;
  }, [data?.pages]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={filter}
            onValueChange={(v: string | null) => {
              if (v) setFilter(v as 'all' | 'unread');
            }}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue>
                {(value: string | null) => {
                  if (value === 'unread') return 'Unread only';
                  return 'All';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All">All</SelectItem>
              <SelectItem value="unread" label="Unread only">Unread only</SelectItem>
            </SelectContent>
          </Select>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => markAllAsRead.mutate(undefined)}
          disabled={!unreadCount}
        >
          <CheckCheck className="size-3.5" />
          Mark all read
        </Button>
      </div>

      {/* List */}
      <AsyncContent
        loading={isLoading}
        empty={notifications.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground text-center py-12">
            {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          </p>
        }
      >
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <Separator />}
              <div className="px-4 py-2 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
              </div>
              <div className="divide-y divide-border">
                {group.items.map((n) => (
                  <NotificationItem key={n.id} notification={n} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </AsyncContent>

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
