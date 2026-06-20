'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import type { TimeReportGroup } from '@/lib/api/time-tracking.api';

interface TimeReportChartProps {
  groups: TimeReportGroup[];
  groupBy: string;
}

export function TimeReportChart({ groups, groupBy }: TimeReportChartProps) {
  const data = groups.map((g) => ({
    label: groupBy === 'DATE'
      ? format(new Date(g.key), 'MMM d')
      : g.label.length > 20
        ? g.label.slice(0, 20) + '…'
        : g.label,
    hours: Math.round((g.duration / 60) * 10) / 10,
  }));

  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-4">
        Time by {groupBy === 'DATE' ? 'Day' : groupBy === 'USER' ? 'User' : 'Issue'}
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="text-xs"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            className="text-xs"
            label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [`${value}h`, 'Time']}
          />
          <Bar
            dataKey="hours"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
