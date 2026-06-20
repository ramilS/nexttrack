'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { useSprintBurndown } from '@/lib/hooks/use-sprints';
import { AsyncContent } from '@/components/shared/async-content';
import { cn } from '@/lib/utils';

interface BurndownChartProps {
  boardId: string;
  sprintId: string;
  className?: string;
}

export function BurndownChart({ boardId, sprintId, className }: BurndownChartProps) {
  const { data: points, isLoading } = useSprintBurndown(boardId, sprintId);

  return (
    <AsyncContent
      loading={isLoading}
      data={points}
      empty={(d) => d.length === 0}
      emptyState={
        <p className="text-sm text-muted-foreground text-center py-8">
          No burndown data available yet.
        </p>
      }
    >
      {(points) => (
        <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
          <h3 className="text-sm font-semibold mb-4">Burndown Chart</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => format(new Date(v), 'MMM d')}
                className="text-xs"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                className="text-xs"
                tick={{ fontSize: 11 }}
                label={{ value: 'Story Points', angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
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
              <Line
                type="linear"
                dataKey="ideal"
                name="Ideal"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Remaining"
                stroke="hsl(var(--primary))"
                dot={{ r: 3 }}
                strokeWidth={2}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AsyncContent>
  );
}
