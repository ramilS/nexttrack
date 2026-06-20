'use client';

import { format, differenceInDays } from 'date-fns';
import { Calendar, Target } from 'lucide-react';
import type { Sprint } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface SprintPanelProps {
  sprint: Sprint;
  compact?: boolean;
  className?: string;
}

export function SprintPanel({ sprint, compact, className }: SprintPanelProps) {
  const progress =
    sprint.totalIssues > 0
      ? Math.round((sprint.completedIssues / sprint.totalIssues) * 100)
      : 0;

  const daysLeft =
    sprint.endDate
      ? Math.max(0, differenceInDays(new Date(sprint.endDate), new Date()))
      : null;

  if (compact) {
    return (
      <div className={cn('px-3 pb-2.5 space-y-1.5', className)}>
        {sprint.goal && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="size-3 shrink-0" />
            {sprint.goal}
          </p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {sprint.startDate && (
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {format(new Date(sprint.startDate), 'MMM d')}
              {sprint.endDate && <> — {format(new Date(sprint.endDate), 'MMM d, yyyy')}</>}
            </span>
          )}
          {daysLeft != null && sprint.status === 'ACTIVE' && (
            <span className={cn(daysLeft <= 2 && 'text-destructive font-medium')}>
              {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
        </div>
      </div>
    );
  }

  // Full version (used standalone, e.g. in board views)
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">{sprint.name}</h3>
          {sprint.goal && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Target className="size-3" />
              {sprint.goal}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        {sprint.startDate && (
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {format(new Date(sprint.startDate), 'MMM d')}
            {sprint.endDate && <> — {format(new Date(sprint.endDate), 'MMM d, yyyy')}</>}
          </span>
        )}
        {daysLeft != null && sprint.status === 'ACTIVE' && (
          <span className={cn(daysLeft <= 2 && 'text-destructive font-medium')}>
            {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
          </span>
        )}
        <span>
          {sprint.completedIssues}/{sprint.totalIssues} issues
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{progress}% complete</span>
      </div>
    </div>
  );
}
