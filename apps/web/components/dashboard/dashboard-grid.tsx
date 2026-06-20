'use client';

import { useCallback, useMemo, useRef } from 'react';
import { ResponsiveGridLayout, useContainerWidth, type Layout, type ResponsiveLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WidgetCard } from './widget-card';
import { useUpdateDashboard } from '@/lib/hooks/use-dashboards';
import { WidgetDataProvider } from './widget-data-provider';
import type { Dashboard, WidgetLayout, WidgetType } from '@/lib/api/dashboards.api';

const DEFAULT_WIDGET_SIZES: Partial<Record<WidgetType, { w: number; h: number }>> = {
  MY_ISSUES: { w: 6, h: 4 },
  ASSIGNED_TO_ME: { w: 6, h: 4 },
  RECENT_ACTIVITY: { w: 6, h: 4 },
  PROJECT_PROGRESS: { w: 4, h: 3 },
  SPRINT_BURNDOWN: { w: 6, h: 4 },
  CFD_MINI: { w: 6, h: 4 },
  VELOCITY_MINI: { w: 6, h: 4 },
  ISSUES_BY_STATUS: { w: 4, h: 3 },
  ISSUES_BY_PRIORITY: { w: 4, h: 3 },
  ISSUES_BY_TYPE: { w: 4, h: 3 },
  WATCHED_ISSUES: { w: 6, h: 4 },
  TIME_SPENT_TODAY: { w: 3, h: 2 },
  OVERDUE_ISSUES: { w: 6, h: 3 },
  CUSTOM_FILTER: { w: 6, h: 4 },
};

const FALLBACK_SIZE = { w: 4, h: 3 };
const COLS = 12;

interface DashboardGridProps {
  dashboard: Dashboard;
}

export function DashboardGrid({ dashboard }: DashboardGridProps) {
  const updateDashboard = useUpdateDashboard();
  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 });
  const isUserDrag = useRef(false);

  const handleLayoutChange = useCallback(
    (_layout: Layout, allLayouts: ResponsiveLayouts) => {
      if (!isUserDrag.current) return;
      isUserDrag.current = false;

      const lgLayout = allLayouts.lg ?? _layout;
      const widgetLayout: WidgetLayout[] = (lgLayout as Layout).map((l) => ({
        widgetId: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
      }));
      updateDashboard.mutate({ id: dashboard.id, data: { layout: widgetLayout } });
    },
    [dashboard.id, updateDashboard],
  );

  const handleDragStop = useCallback(() => {
    isUserDrag.current = true;
  }, []);

  const handleResizeStop = useCallback(() => {
    isUserDrag.current = true;
  }, []);

  const gridLayout = useMemo(() => {
    const layoutMap = new Map(dashboard.layout.map((wl) => [wl.widgetId, wl]));
    let nextY = 0;

    return dashboard.widgets.map((widget, index) => {
      const existing = layoutMap.get(widget.id);
      if (existing && existing.w > 0 && existing.h > 0) {
        return {
          i: widget.id,
          x: existing.x,
          y: existing.y,
          w: existing.w,
          h: existing.h,
          minW: 2,
          minH: 2,
        };
      }

      const size = DEFAULT_WIDGET_SIZES[widget.type] ?? FALLBACK_SIZE;
      const x = (index % 2) * 6;
      const item = {
        i: widget.id,
        x,
        y: nextY,
        w: size.w,
        h: size.h,
        minW: 2,
        minH: 2,
      };
      if (x + size.w >= COLS) {
        nextY += size.h;
      }
      return item;
    });
  }, [dashboard.layout, dashboard.widgets]);

  return (
    <WidgetDataProvider dashboardId={dashboard.id}>
      <div ref={containerRef} className="w-full">
        <ResponsiveGridLayout
          width={width}
          layouts={{ lg: gridLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: COLS, md: 8, sm: 4 }}
          rowHeight={80}
          onLayoutChange={handleLayoutChange}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          dragConfig={{ handle: '.widget-drag-handle' }}
          className="layout"
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard widget={widget} dashboardId={dashboard.id} />
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
    </WidgetDataProvider>
  );
}
