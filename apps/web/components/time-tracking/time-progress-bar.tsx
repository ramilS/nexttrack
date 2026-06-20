'use client';

import { formatDuration } from '@/components/shared/duration-input';
import { cn } from '@/lib/utils';

interface TimeProgressBarProps {
  estimate: number | null;
  spent: number;
}

export function TimeProgressBar({ estimate, spent }: TimeProgressBarProps) {
  const percent = estimate && estimate > 0 ? Math.min(Math.round((spent / estimate) * 100), 100) : 0;
  const overBudget = estimate !== null && spent > estimate;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Estimate: {estimate ? formatDuration(estimate) : '—'}
        </span>
        <span className={cn('font-medium', overBudget && 'text-destructive')}>
          Spent: {formatDuration(spent)}
        </span>
      </div>
      {estimate !== null && estimate > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              overBudget ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {estimate !== null && estimate > 0 && (
        <p className={cn('text-[11px]', overBudget ? 'text-destructive' : 'text-muted-foreground')}>
          {percent}%{overBudget && ` — over by ${formatDuration(spent - estimate)}`}
        </p>
      )}
    </div>
  );
}
