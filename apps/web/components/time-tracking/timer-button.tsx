'use client';

import { useState } from 'react';
import { Play, Square, Clock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTimerStore } from '@/lib/stores/timer.store';
import { useStartTimer, useStopTimer } from '@/lib/hooks/use-timer';
import { TimerDisplay } from './timer-display';
import { TimeProgressBar } from './time-progress-bar';
import { LogTimeDialog } from './log-time-dialog';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import { format } from 'date-fns';

interface TimerButtonProps {
  issueId: string;
  issueKey: string;
  estimate: number | null;
  spent: number;
}

export function TimerButton({ issueId, issueKey, estimate, spent }: TimerButtonProps) {
  const canLogTime = useHasPermission(Permission.TIME_LOG_OWN);
  const [logOpen, setLogOpen] = useState(false);
  const isRunning = useTimerStore((s) => s.isRunning);
  const activeIssueId = useTimerStore((s) => s.issueId);
  const startedAt = useTimerStore((s) => s.startedAt);

  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();

  const isThisIssue = isRunning && activeIssueId === issueId;

  function handleToggle() {
    if (isThisIssue) {
      stopTimer.mutate(undefined);
    } else {
      startTimer.mutate({ issueId, issueKey });
    }
  }

  return (
    <div className="space-y-3">
      <TimeProgressBar estimate={estimate} spent={spent} />

      <div className="flex items-center gap-2">
        {isThisIssue ? (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Clock className="size-3.5 text-primary animate-pulse shrink-0" />
              <TimerDisplay />
              {startedAt && (
                <span className="text-[11px] text-muted-foreground">
                  started {format(startedAt, 'HH:mm')}
                </span>
              )}
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={handleToggle}
              disabled={stopTimer.isPending}
            >
              <Square className="size-3" />
              Stop
            </Button>
          </>
        ) : (
          <>
            {canLogTime && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleToggle}
                disabled={startTimer.isPending || (isRunning && activeIssueId !== issueId)}
              >
                <Play className="size-3" />
                {isRunning ? 'Timer active on another issue' : 'Start Timer'}
              </Button>
            )}
            {canLogTime && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setLogOpen(true)}
              >
                <Plus className="size-3" />
                Log Time
              </Button>
            )}
          </>
        )}
      </div>

      <LogTimeDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        issueId={issueId}
        issueKey={issueKey}
      />
    </div>
  );
}
