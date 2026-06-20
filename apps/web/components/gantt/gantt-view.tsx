'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, subDays, format } from 'date-fns';
import { Loader2, BarChart3 } from 'lucide-react';
import type { ITask, ILink } from '@svar-ui/react-gantt';

import { useGanttData } from '@/lib/hooks/use-gantt';
import { useUpdateIssue } from '@/lib/hooks/use-issues';
import type { GanttGroupBy, GanttItem } from '@/lib/api/gantt.api';
import { GanttToolbar, type ViewMode } from './gantt-toolbar';
import GanttChart from './gantt-chart';

function toSvarTasks(items: GanttItem[], projectKey: string): ITask[] {
  const itemIds = new Set(items.map((i) => i.id));

  // Check which items actually have children present in the dataset
  const parentIds = new Set(
    items
      .filter((i) => i.parentId && itemIds.has(i.parentId))
      .map((i) => i.parentId!),
  );

  return items.map((item) => {
    const today = new Date();
    const start = item.startDate ? new Date(item.startDate) : (item.dueDate ? addDays(new Date(item.dueDate), -3) : today);
    const rawEnd = item.dueDate ? new Date(item.dueDate) : (item.startDate ? addDays(new Date(item.startDate), 3) : addDays(today, 3));
    const end = rawEnd <= start ? addDays(start, 1) : rawEnd;

    // Only use 'summary' type when children are actually present in the tasks array.
    // SVAR crashes with "forEach of null" if a summary task has open=true but no children.
    const hasVisibleChildren = parentIds.has(item.id);
    const effectiveType = hasVisibleChildren ? 'summary' : 'task';

    return {
      id: item.id,
      text: `${projectKey}-${item.issueNumber} ${item.title}`,
      start,
      end,
      progress: Math.round(item.progress * 100),
      type: effectiveType,
      parent: item.parentId && itemIds.has(item.parentId) ? item.parentId : 0,
      open: hasVisibleChildren,
      issueNumber: item.issueNumber,
      priority: item.priority,
      statusName: item.status.name,
      statusColor: item.status.color,
      assigneeName: item.assignee?.name ?? null,
    } satisfies ITask;
  });
}

function toSvarLinks(items: GanttItem[]): ILink[] {
  const links: ILink[] = [];
  let linkId = 1;

  for (const item of items) {
    for (const depId of item.dependencies) {
      links.push({
        id: linkId++,
        source: depId,
        target: item.id,
        type: 'e2s',
      });
    }
  }

  return links;
}

const SCALES_BY_VIEW: Record<ViewMode, { unit: string; step: number; format?: string }[]> = {
  Day: [
    { unit: 'month', step: 1, format: '%F %Y' },
    { unit: 'day', step: 1, format: '%j' },
  ],
  Week: [
    { unit: 'month', step: 1, format: '%F %Y' },
    { unit: 'week', step: 1, format: 'W%W' },
  ],
  Month: [
    { unit: 'year', step: 1, format: '%Y' },
    { unit: 'month', step: 1, format: '%M' },
  ],
};

const CELL_WIDTH_BY_VIEW: Record<ViewMode, number> = {
  Day: 40,
  Week: 120,
  Month: 120,
};

interface GanttViewProps {
  projectKey: string;
}

export function GanttView({ projectKey }: GanttViewProps) {
  const router = useRouter();
  const updateIssue = useUpdateIssue();

  const [viewMode, setViewMode] = useState<ViewMode>('Week');
  const [groupBy, setGroupBy] = useState<GanttGroupBy>('NONE');
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    return { from: subDays(today, 14), to: addDays(today, 60) };
  });

  const params = useMemo(
    () => ({
      from: format(dateRange.from, 'yyyy-MM-dd'),
      to: format(dateRange.to, 'yyyy-MM-dd'),
      groupBy,
    }),
    [dateRange, groupBy],
  );

  const { data, isLoading } = useGanttData(projectKey, params);

  const tasks = useMemo(() => {
    if (!data) return [];
    return toSvarTasks(data.items, projectKey);
  }, [data, projectKey]);

  const links = useMemo(() => {
    if (!data) return [];
    return toSvarLinks(data.items);
  }, [data]);

  const scales = SCALES_BY_VIEW[viewMode];
  const cellWidth = CELL_WIDTH_BY_VIEW[viewMode];

  const handleUpdateTask = useCallback(
    (ev: { id: string | number; task: Partial<ITask> }) => {
      const item = data?.items.find((i) => i.id === ev.id);
      if (!item) return;

      const updates: Record<string, string> = {};
      if (ev.task.start) updates.startDate = ev.task.start.toISOString();
      if (ev.task.end) updates.dueDate = ev.task.end.toISOString();

      if (Object.keys(updates).length > 0) {
        updateIssue.mutate({
          projectKey,
          issueNumber: item.issueNumber,
          issueId: item.id,
          data: updates,
        });
      }
    },
    [data, projectKey, updateIssue],
  );

  const handleSelectTask = useCallback(
    (ev: { id: string | number }) => {
      const item = data?.items.find((i) => i.id === ev.id);
      if (item) {
        router.push(`/projects/${projectKey}/issues/${item.issueNumber}`);
      }
    },
    [data, projectKey, router],
  );

  const toolbar = (
    <GanttToolbar
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      groupBy={groupBy}
      onGroupByChange={setGroupBy}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    />
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data || tasks.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <BarChart3 className="size-10 opacity-40" />
          <p className="text-sm">No issues with dates found in this range.</p>
          <p className="text-xs">Set start and due dates on issues to see them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex-1 overflow-hidden">
        <GanttChart
          tasks={tasks}
          links={links}
          scales={scales}
          cellWidth={cellWidth}
          start={dateRange.from}
          end={dateRange.to}
          onUpdateTask={handleUpdateTask}
          onSelectTask={handleSelectTask}
        />
      </div>
    </div>
  );
}
