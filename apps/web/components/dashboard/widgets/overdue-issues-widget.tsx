'use client';

import Link from 'next/link';
import { routes } from '@/lib/routes';
import { RelativeTime } from '@/components/shared/relative-time';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { OverdueIssuesWidgetData } from '@repo/shared/schemas';

function OverdueIssuesWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<OverdueIssuesWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No overdue issues.</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((issue) => (
          <Link
            key={issue.id}
            href={routes.project(issue.projectKey).issues.detail(issue.number)}
            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50 transition-colors"
          >
            <PriorityBadge priority={issue.priority} showLabel={false} />
            <span className="text-xs text-muted-foreground shrink-0">{issue.projectKey}-{issue.number}</span>
            <span className="text-sm truncate flex-1">{issue.title}</span>
            <span className="text-xs text-destructive shrink-0"><RelativeTime date={issue.dueDate} variant="relative" addSuffix={false} className="text-xs text-destructive" /> overdue</span>
          </Link>
      ))}
    </div>
  );
}

export default OverdueIssuesWidget;
