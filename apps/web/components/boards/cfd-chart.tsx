'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { AsyncContent } from '@/components/shared/async-content';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCfd } from '@/lib/hooks/use-charts';
import { cn } from '@/lib/utils';

interface CfdChartProps {
  projectKey: string;
  boardId: string;
  className?: string;
}

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const INTERVAL_OPTIONS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
];

export function CfdChart({ projectKey, boardId, className }: CfdChartProps) {
  const [rangeDays, setRangeDays] = useState('30');
  const [interval, setInterval] = useState<'day' | 'week'>('day');

  const from = useMemo(
    () => format(subDays(new Date(), Number(rangeDays)), 'yyyy-MM-dd'),
    [rangeDays],
  );
  const to = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const { data, isLoading } = useCfd(projectKey, boardId, { from, to, interval });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.dates.map((date, i) => {
      const point: Record<string, string | number> = { date };
      for (const s of data.series) {
        point[s.statusName] = s.counts[i] ?? 0;
      }
      return point;
    });
  }, [data]);

  return (
    <AsyncContent
      loading={isLoading}
      data={data}
      empty={(d) => d.dates.length === 0}
      emptyState={
        <p className="text-sm text-muted-foreground text-center py-8">
          No cumulative flow data available yet.
        </p>
      }
    >
      {(data) => (
        <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Cumulative Flow Diagram</h3>
            <div className="flex items-center gap-2">
              <Select
                value={rangeDays}
                onValueChange={(v: string | null) => {
                  if (v) setRangeDays(v);
                }}
              >
                <SelectTrigger className="h-7 w-auto text-xs">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = RANGE_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'Select range';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={interval}
                onValueChange={(v: string | null) => {
                  if (v) setInterval(v as 'day' | 'week');
                }}
              >
                <SelectTrigger className="h-7 w-auto text-xs">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = INTERVAL_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'Select interval';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => format(new Date(v), 'MMM d')}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={(v) => format(new Date(String(v)), 'MMM d, yyyy')}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {data.series.map((s) => (
                <Area
                  key={s.statusId}
                  type="monotone"
                  dataKey={s.statusName}
                  stackId="1"
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AsyncContent>
  );
}
