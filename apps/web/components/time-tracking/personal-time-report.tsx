'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserTimeReport, type UserTimeLog } from '@/lib/hooks/use-user-time-report';
import { Clock, Calendar } from 'lucide-react';

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateFrom: from.toISOString().split('T')[0]!,
    dateTo: to.toISOString().split('T')[0]!,
  };
}

export function PersonalTimeReport() {
  const defaults = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);

  const { data, isLoading } = useUserTimeReport({ dateFrom, dateTo });

  const logs = data?.logs ?? [];

  const logsByDate = logs.reduce<Record<string, UserTimeLog[]>>(
    (acc, log) => {
      const date = log.date.split('T')[0]!;
      if (!acc[date]) acc[date] = [];
      acc[date]!.push(log);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="date-from">From</Label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-to">To</Label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            const d = getDefaultDateRange();
            setDateFrom(d.dateFrom);
            setDateTo(d.dateTo);
          }}
        >
          <Calendar className="size-4" />
          This Month
        </Button>
      </div>

      {data && (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">
              Total: {data.totalDurationFormatted}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !logs.length ? (
        <Card>
          <CardContent className="text-center py-12">
            <Clock className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No time entries for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(logsByDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, dateLogs]) => {
              const dayTotal = dateLogs.reduce((sum, l) => sum + l.duration, 0);
              const dayH = Math.floor(dayTotal / 60);
              const dayM = dayTotal % 60;
              const dayFormatted = dayH > 0 && dayM > 0 ? `${dayH}h ${dayM}m` : dayH > 0 ? `${dayH}h` : `${dayM}m`;
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">
                      {new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </h3>
                    <span className="text-xs text-muted-foreground font-medium">
                      {dayFormatted}
                    </span>
                  </div>
                  <Card className="gap-0 py-0 overflow-hidden">
                    {dateLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0"
                      >
                        <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                          {log.durationFormatted}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm">
                            <span className="text-muted-foreground">{log.issue.projectKey}-{log.issue.number}</span>
                            {' '}
                            {log.issue.title}
                          </span>
                          {log.description && (
                            <p className="text-xs text-muted-foreground truncate">{log.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
