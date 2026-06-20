'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { VelocityMiniWidgetData } from '@repo/shared/schemas';

function VelocityMiniWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<VelocityMiniWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  if (!data || data.sprints.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No velocity data.</p>;
  }

  return (
    <div className="h-full">
      <p className="text-xs text-muted-foreground mb-2">Avg: {data.averageVelocity} pts/sprint</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data.sprints} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '11px',
            }}
          />
          <ReferenceLine y={data.averageVelocity} stroke="hsl(var(--destructive))" strokeDasharray="5 5" strokeWidth={1.5} />
          <Bar dataKey="planned" name="Planned" fill="hsl(var(--muted-foreground))" fillOpacity={0.4} radius={[3, 3, 0, 0]} />
          <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default VelocityMiniWidget;
