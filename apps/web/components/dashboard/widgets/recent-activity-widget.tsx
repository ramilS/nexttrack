'use client';

import { RelativeTime } from '@/components/shared/relative-time';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { RecentActivityWidgetData } from '@repo/shared/schemas';

function RecentActivityWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<RecentActivityWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No recent activity.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug">{item.summary}</p>
              <p className="mt-0.5"><RelativeTime date={item.createdAt} /></p>
            </div>
          </div>
      ))}
    </div>
  );
}

export default RecentActivityWidget;
