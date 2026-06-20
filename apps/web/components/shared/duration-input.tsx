'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 8 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 5 * MINUTES_PER_DAY;

export function parseDuration(input: string): number | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);

  let total = 0;
  const regex = /(\d+(?:\.\d+)?)\s*(w|d|h|m)/g;
  let match;
  let hasMatch = false;

  while ((match = regex.exec(normalized)) !== null) {
    hasMatch = true;
    const value = parseFloat(match[1]!);
    const unit = match[2];

    switch (unit) {
      case 'w': total += value * MINUTES_PER_WEEK; break;
      case 'd': total += value * MINUTES_PER_DAY; break;
      case 'h': total += value * MINUTES_PER_HOUR; break;
      case 'm': total += value; break;
    }
  }

  return hasMatch ? Math.round(total) : null;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';

  let remaining = minutes;
  const weeks = Math.floor(remaining / MINUTES_PER_WEEK);
  remaining %= MINUTES_PER_WEEK;
  const days = Math.floor(remaining / MINUTES_PER_DAY);
  remaining %= MINUTES_PER_DAY;
  const hours = Math.floor(remaining / MINUTES_PER_HOUR);
  const mins = remaining % MINUTES_PER_HOUR;

  const parts: string[] = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);

  return parts.join(' ');
}

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface DurationInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function DurationInput({
  value,
  onChange,
  className,
  placeholder = '2h 30m',
  autoFocus,
}: DurationInputProps) {
  const parsed = useMemo(() => parseDuration(value), [value]);

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('font-mono', className)}
        autoFocus={autoFocus}
      />
      {value.trim() && (
        <p className={cn('text-[11px]', parsed !== null ? 'text-muted-foreground' : 'text-destructive')}>
          {parsed !== null ? `= ${formatDuration(parsed)}` : 'Invalid format. Try: 2h 30m, 1d, 150m'}
        </p>
      )}
    </div>
  );
}
