'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/shared';
import { useTimeLogs, useDeleteTimeLog } from '@/lib/hooks/use-time-tracking';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useIsAdmin } from '@/lib/hooks/use-is-admin';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import { formatDuration } from '@/components/shared/duration-input';
import { EditTimeLogDialog } from './edit-time-log-dialog';
import type { TimeLogDto } from '@/lib/api/time-tracking.api';

interface TimeLogsListProps {
  issueId: string;
  estimate: number | null;
}

export function TimeLogsList({ issueId, estimate }: TimeLogsListProps) {
  const { data, isLoading } = useTimeLogs(issueId);
  const deleteLog = useDeleteTimeLog(issueId);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = useIsAdmin();
  const hasTimeLogPermission = useHasPermission(Permission.TIME_LOG_OWN);
  const [editingLog, setEditingLog] = useState<TimeLogDto | null>(null);

  const logs = data?.items ?? [];
  const totalSpent = logs.reduce((sum, l) => sum + l.duration, 0);

  return (
    <AsyncContent
      loading={isLoading}
      empty={logs.length === 0}
      emptyState={
        <p className="text-xs text-muted-foreground py-3 text-center">
          No time logged yet.
        </p>
      }
      className="py-4"
      spinnerClassName="size-4"
    >
    <div className="space-y-1">
      {logs.map((log) => {
        const canModify = (currentUser?.id === log.userId && hasTimeLogPermission) || isAdmin;
        return (
          <div
            key={log.id}
            className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/30 transition-colors"
          >
            <UserAvatar user={{ name: log.userName, avatarUrl: log.userAvatarUrl }} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{log.userName}</span>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(log.date), 'MMM d')}
                </span>
                <span className="ml-auto text-xs font-mono font-medium">
                  {log.durationFormatted || formatDuration(log.duration)}
                </span>
              </div>
              {log.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {log.description}
                </p>
              )}
            </div>
            {canModify && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-6 opacity-0 group-hover:opacity-100 shrink-0" />}>
                  <MoreHorizontal className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditingLog(log)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => deleteLog.mutate(log.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-border pt-2 px-2">
        <span className="text-xs text-muted-foreground">Total</span>
        <span className="text-xs font-medium">
          {formatDuration(totalSpent)}
          {estimate ? ` / ${formatDuration(estimate)} estimate` : ''}
        </span>
      </div>

      {editingLog && (
        <EditTimeLogDialog
          open={!!editingLog}
          onOpenChange={(v) => !v && setEditingLog(null)}
          issueId={issueId}
          log={editingLog}
        />
      )}
    </div>
    </AsyncContent>
  );
}
