'use client';

import { formatElapsed } from '@/components/shared/duration-input';
import { useTimerStore } from '@/lib/stores/timer.store';
import { useTimerTick } from '@/lib/hooks/use-timer';
import { cn } from '@/lib/utils';

interface TimerDisplayProps {
  className?: string;
}

export function TimerDisplay({ className }: TimerDisplayProps) {
  const elapsed = useTimerStore((s) => s.elapsed);
  useTimerTick();

  return (
    <span className={cn('font-mono tabular-nums text-sm', className)}>
      {formatElapsed(elapsed)}
    </span>
  );
}
