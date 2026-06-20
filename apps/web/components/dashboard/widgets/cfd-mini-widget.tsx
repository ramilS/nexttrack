'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { CfdMiniWidgetData } from '@repo/shared/schemas';

function CfdMiniWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<CfdMiniWidgetData>(dashboardId, widget.id);

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

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  if (!data || data.dates.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No CFD data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tickFormatter={(v: string) => format(new Date(v), 'MMM d')} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          labelFormatter={(v) => format(new Date(String(v)), 'MMM d')}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        />
        {data.series.map((s) => (
          <Area key={s.statusName} type="monotone" dataKey={s.statusName} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.6} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default CfdMiniWidget;
