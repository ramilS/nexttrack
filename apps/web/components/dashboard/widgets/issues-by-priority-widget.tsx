'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { LabelCountWidgetData } from '@repo/shared/schemas';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'hsl(var(--priority-urgent))',
  HIGH: 'hsl(var(--priority-high))',
  MEDIUM: 'hsl(var(--priority-medium))',
  LOW: 'hsl(var(--priority-low))',
  NONE: 'hsl(var(--priority-none))',
};

function IssuesByPriorityWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<LabelCountWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={items} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%">
          {items.map((entry) => (
            <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] ?? 'hsl(var(--muted))'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default IssuesByPriorityWidget;
