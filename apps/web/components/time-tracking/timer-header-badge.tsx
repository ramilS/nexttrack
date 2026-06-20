'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { routes } from '@/lib/routes';
import { useTimerStore } from '@/lib/stores/timer.store';
import { useActiveTimer, useTimerTick } from '@/lib/hooks/use-timer';
import { formatElapsed } from '@/components/shared/duration-input';

export function TimerHeaderBadge() {
  useActiveTimer();
  useTimerTick();

  const isRunning = useTimerStore((s) => s.isRunning);
  const issueKey = useTimerStore((s) => s.issueKey);
  const elapsed = useTimerStore((s) => s.elapsed);

  if (!isRunning || !issueKey) return null;

  const dashIdx = issueKey.indexOf('-');
  const projectKey = issueKey.slice(0, dashIdx);
  const issueNumber = Number(issueKey.slice(dashIdx + 1));

  return (
    <Link
      href={routes.project(projectKey).issues.detail(issueNumber)}
      className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <Clock className="size-3 animate-pulse" />
      <span>{issueKey}</span>
      <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
    </Link>
  );
}
