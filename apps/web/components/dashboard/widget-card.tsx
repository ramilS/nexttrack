'use client';

import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WidgetRenderer } from './widget-renderer';
import { useRemoveWidget } from '@/lib/hooks/use-dashboards';
import type { DashboardWidget } from '@/lib/api/dashboards.api';

interface WidgetCardProps {
  widget: DashboardWidget;
  dashboardId: string;
}

export function WidgetCard({ widget, dashboardId }: WidgetCardProps) {
  const removeWidget = useRemoveWidget(dashboardId);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="widget-drag-handle cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="size-3.5" />
        </div>
        <span className="flex-1 truncate text-xs font-medium">{widget.title}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label={`Remove widget "${widget.title}"`}
          onClick={() => removeWidget.mutate(widget.id)}
        >
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <WidgetRenderer widget={widget} dashboardId={dashboardId} />
      </div>
    </div>
  );
}
