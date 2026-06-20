'use client';

import { formatDistanceToNow, format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatSmartTimestamp } from '@/lib/dates';

type RelativeTimeVariant = 'smart' | 'relative';

interface RelativeTimeProps {
  date: string | Date;
  /**
   * `smart` (default) — YouTrack-style label: now / 09:05 / Jun 8 / Jan 3, 2024.
   * `relative` — "2 days ago"; use only for future-dated values, where `smart`
   * would wrongly collapse to "now".
   */
  variant?: RelativeTimeVariant;
  addSuffix?: boolean;
  className?: string;
}

export function RelativeTime({ date, variant = 'smart', addSuffix = true, className }: RelativeTimeProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const label = variant === 'relative'
    ? formatDistanceToNow(dateObj, { addSuffix })
    : formatSmartTimestamp(dateObj);
  const full = format(dateObj, 'PPpp');

  return (
    <Tooltip>
      <TooltipTrigger render={<time dateTime={dateObj.toISOString()} />}>
        <span className={cn('text-xs text-muted-foreground', className)}>{label}</span>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}
