'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { routes } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { useNotifications, useUnreadCount, useMarkAllAsRead } from '@/lib/hooks/use-notifications';
import { useRealtimeNotifications } from '@/lib/hooks/use-realtime-notifications';
import { NotificationItem } from './notification-item';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount } = useUnreadCount();
  const { data, fetchNextPage, hasNextPage } = useNotifications({ pageSize: 10 }, { enabled: open });
  const markAllAsRead = useMarkAllAsRead();

  useRealtimeNotifications();

  const notifications = data?.pages.flatMap((p) => p.items) ?? [];
  const count = unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
          />
        }
      >
        <Bell className="size-4.5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[min(30rem,calc(100vh-6rem))] w-96 flex-col overflow-hidden gap-0 p-0">
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllAsRead.mutate(undefined)}
            >
              <CheckCheck className="size-3" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notifications yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} compact />
              ))}
            </div>
          )}
          {hasNextPage && (
            <div className="p-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-2">
          <Link
            href={routes.notifications.list}
            className="text-xs text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
