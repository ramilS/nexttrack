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

const TYPE_COLORS: Record<string, string> = {
  TASK: 'var(--primary)',
  BUG: 'var(--destructive)',
  STORY: 'var(--success)',
  EPIC: 'var(--chart-epic)',
  FEATURE: 'var(--chart-feature)',
};

function IssuesByTypeWidget({ widget, dashboardId }: WidgetProps) {
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
            <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? 'var(--muted-foreground)'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default IssuesByTypeWidget;
