'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { SprintBurndownWidgetData } from '@repo/shared/schemas';

function SprintBurndownWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<SprintBurndownWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const points = data?.points ?? [];

  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No active sprint.</p>;
  }

  return (
    <div className="h-full">
      {data?.sprintName && (
        <p className="text-xs text-muted-foreground mb-2">{data.sprintName}</p>
      )}
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
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
          <Line type="linear" dataKey="ideal" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" dot={{ r: 2 }} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SprintBurndownWidget;
