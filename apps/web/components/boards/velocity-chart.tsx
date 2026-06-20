'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { AsyncContent } from '@/components/shared/async-content';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVelocity } from '@/lib/hooks/use-charts';
import { cn } from '@/lib/utils';

interface VelocityChartProps {
  projectKey: string;
  boardId: string;
  className?: string;
}

const LIMIT_OPTIONS = [
  { value: '5', label: 'Last 5 sprints' },
  { value: '10', label: 'Last 10 sprints' },
  { value: '15', label: 'Last 15 sprints' },
  { value: '20', label: 'Last 20 sprints' },
];

export function VelocityChart({ projectKey, boardId, className }: VelocityChartProps) {
  const [limit, setLimit] = useState('10');
  const { data, isLoading } = useVelocity(projectKey, boardId, { limit: Number(limit) });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.sprints.map((s) => ({
      name: s.name,
      planned: s.planned,
      completed: s.completed,
    }));
  }, [data]);

  return (
    <AsyncContent
      loading={isLoading}
      data={data}
      empty={(d) => d.sprints.length === 0}
      emptyState={
        <p className="text-sm text-muted-foreground text-center py-8">
          No velocity data available yet. Complete a sprint to see velocity.
        </p>
      }
    >
      {(data) => (
        <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Velocity Chart</h3>
              <span className="text-xs text-muted-foreground">
                Avg: {data.averageVelocity} pts/sprint
              </span>
            </div>
            <Select
              value={limit}
              onValueChange={(v: string | null) => {
                if (v) setLimit(v);
              }}
            >
              <SelectTrigger className="h-7 w-auto text-xs">
                <SelectValue>
                  {(value: string | null) => {
                    const opt = LIMIT_OPTIONS.find((o) => o.value === value);
                    return opt?.label ?? 'Select limit';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine
                y={data.averageVelocity}
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `Avg: ${data.averageVelocity}`,
                  position: 'right',
                  fontSize: 11,
                  fill: 'hsl(var(--destructive))',
                }}
              />
              <Bar
                dataKey="planned"
                name="Planned"
                fill="hsl(var(--muted-foreground))"
                fillOpacity={0.4}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="completed"
                name="Completed"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AsyncContent>
  );
}
