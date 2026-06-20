'use client';

import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Clock } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { TimeSpentTodayWidgetData } from '@repo/shared/schemas';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TimeSpentTodayWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<TimeSpentTodayWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const totalMinutes = data?.totalMinutes ?? 0;
  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <Clock className="size-5 text-muted-foreground" />
      <span className="text-2xl font-bold tabular-nums">{formatDuration(totalMinutes)}</span>
      {entries.length > 0 && (
        <div className="w-full mt-2 space-y-1">
          {entries.slice(0, 5).map((entry) => (
            <div key={entry.issueKey} className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground">{entry.issueKey}</span>
              <span className="tabular-nums">{formatDuration(entry.minutes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TimeSpentTodayWidget;
