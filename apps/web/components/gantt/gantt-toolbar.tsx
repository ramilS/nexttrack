'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { format, addMonths, addWeeks, addDays, subMonths, subWeeks, subDays } from 'date-fns';
import type { GanttGroupBy } from '@/lib/api/gantt.api';

export type ViewMode = 'Day' | 'Week' | 'Month';

interface GanttToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  groupBy: GanttGroupBy;
  onGroupByChange: (g: GanttGroupBy) => void;
  dateRange: { from: Date; to: Date };
  onDateRangeChange: (range: { from: Date; to: Date }) => void;
}

const VIEW_MODES: ViewMode[] = ['Day', 'Week', 'Month'];

const GROUP_OPTIONS: { value: GanttGroupBy; label: string }[] = [
  { value: 'NONE', label: 'No grouping' },
  { value: 'ASSIGNEE', label: 'Assignee' },
  { value: 'SPRINT', label: 'Sprint' },
  { value: 'TYPE', label: 'Type' },
];

export function GanttToolbar({
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  dateRange,
  onDateRangeChange,
}: GanttToolbarProps) {
  const navigateBack = () => {
    const shift = viewMode === 'Month' ? subMonths : viewMode === 'Week' ? subWeeks : subDays;
    onDateRangeChange({
      from: shift(dateRange.from, 1),
      to: shift(dateRange.to, 1),
    });
  };

  const navigateForward = () => {
    const shift = viewMode === 'Month' ? addMonths : viewMode === 'Week' ? addWeeks : addDays;
    onDateRangeChange({
      from: shift(dateRange.from, 1),
      to: shift(dateRange.to, 1),
    });
  };

  const goToToday = () => {
    const today = new Date();
    const rangeDays = Math.round(
      (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24),
    );
    onDateRangeChange({
      from: today,
      to: addDays(today, rangeDays),
    });
  };

  const formattedRange = `${format(dateRange.from, 'MMM dd')} – ${format(dateRange.to, 'MMM dd, yyyy')}`;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <div className="flex items-center rounded-md border border-border">
          {VIEW_MODES.map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none first:rounded-l-md last:rounded-r-md"
              onClick={() => onViewModeChange(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>

        {/* Group By */}
        <Select value={groupBy} onValueChange={(v: string | null) => { if (v) onGroupByChange(v as GanttGroupBy); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue>
              {(value: string | null) => {
                const opt = GROUP_OPTIONS.find((o) => o.value === value);
                return opt?.label ?? 'Group by';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={navigateBack}>
          <ChevronLeft className="size-4" />
        </Button>

        <Button variant="outline" size="sm" onClick={goToToday} className="gap-1.5">
          <CalendarDays className="size-3.5" />
          Today
        </Button>

        <Button variant="ghost" size="sm" onClick={navigateForward}>
          <ChevronRight className="size-4" />
        </Button>

        <span className="text-sm text-muted-foreground">{formattedRange}</span>
      </div>
    </div>
  );
}
