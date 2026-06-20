'use client';

import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { WidgetType, DashboardWidget } from '@/lib/api/dashboards.api';

const MyIssuesWidget = lazy(() => import('./widgets/my-issues-widget'));
const AssignedToMeWidget = lazy(() => import('./widgets/assigned-to-me-widget'));
const RecentActivityWidget = lazy(() => import('./widgets/recent-activity-widget'));
const ProjectProgressWidget = lazy(() => import('./widgets/project-progress-widget'));
const SprintBurndownWidget = lazy(() => import('./widgets/sprint-burndown-widget'));
const CfdMiniWidget = lazy(() => import('./widgets/cfd-mini-widget'));
const VelocityMiniWidget = lazy(() => import('./widgets/velocity-mini-widget'));
const IssuesByStatusWidget = lazy(() => import('./widgets/issues-by-status-widget'));
const IssuesByPriorityWidget = lazy(() => import('./widgets/issues-by-priority-widget'));
const IssuesByTypeWidget = lazy(() => import('./widgets/issues-by-type-widget'));
const WatchedIssuesWidget = lazy(() => import('./widgets/watched-issues-widget'));
const TimeSpentTodayWidget = lazy(() => import('./widgets/time-spent-today-widget'));
const OverdueIssuesWidget = lazy(() => import('./widgets/overdue-issues-widget'));
const CustomFilterWidget = lazy(() => import('./widgets/custom-filter-widget'));

export interface WidgetProps {
  widget: DashboardWidget;
  dashboardId: string;
}

const WIDGET_COMPONENTS: Record<WidgetType, React.LazyExoticComponent<React.ComponentType<WidgetProps>>> = {
  MY_ISSUES: MyIssuesWidget,
  ASSIGNED_TO_ME: AssignedToMeWidget,
  RECENT_ACTIVITY: RecentActivityWidget,
  PROJECT_PROGRESS: ProjectProgressWidget,
  SPRINT_BURNDOWN: SprintBurndownWidget,
  CFD_MINI: CfdMiniWidget,
  VELOCITY_MINI: VelocityMiniWidget,
  ISSUES_BY_STATUS: IssuesByStatusWidget,
  ISSUES_BY_PRIORITY: IssuesByPriorityWidget,
  ISSUES_BY_TYPE: IssuesByTypeWidget,
  WATCHED_ISSUES: WatchedIssuesWidget,
  TIME_SPENT_TODAY: TimeSpentTodayWidget,
  OVERDUE_ISSUES: OverdueIssuesWidget,
  CUSTOM_FILTER: CustomFilterWidget,
};

function WidgetFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export function WidgetRenderer({ widget, dashboardId }: WidgetProps) {
  const Component = WIDGET_COMPONENTS[widget.type];

  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Unknown widget type: {widget.type}
      </div>
    );
  }

  return (
    <Suspense fallback={<WidgetFallback />}>
      <Component widget={widget} dashboardId={dashboardId} />
    </Suspense>
  );
}
