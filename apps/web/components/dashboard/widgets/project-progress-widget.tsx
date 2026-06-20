'use client';

import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useWidgetData } from '@/lib/hooks/use-dashboards';
import { ColorDot } from '@/components/shared/color-dot';
import { Loader2 } from 'lucide-react';
import type { WidgetProps } from '../widget-renderer';
import type { ProjectProgressWidgetData } from '@repo/shared/schemas';

function ProjectProgressWidget({ widget, dashboardId }: WidgetProps) {
  const { data, isLoading } = useWidgetData<ProjectProgressWidgetData>(dashboardId, widget.id);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No projects.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((project) => (
        <Link
          key={project.key}
          href={routes.project(project.key).issues.list}
          className="block rounded px-2 py-1.5 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ColorDot color={project.color} size="sm" />
              <span className="text-sm font-medium">{project.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{project.openIssueCount} open</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(project.progress * 100, 100)}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

export default ProjectProgressWidget;
