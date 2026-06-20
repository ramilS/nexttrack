'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ListChecks,
  UserCheck,
  Activity,
  BarChart3,
  TrendingUp,
  AreaChart,
  PieChart,
  AlertTriangle,
  Eye,
  Clock,
  Filter,
  FolderKanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddWidget } from '@/lib/hooks/use-dashboards';
import type { WidgetType } from '@/lib/api/dashboards.api';

interface AddWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
}

interface WidgetOption {
  type: WidgetType;
  title: string;
  description: string;
  icon: React.ElementType;
  category: 'Issues' | 'Agile' | 'Time' | 'Activity';
}

const WIDGET_OPTIONS: WidgetOption[] = [
  { type: 'MY_ISSUES', title: 'My Issues', description: 'Issues created by you', icon: ListChecks, category: 'Issues' },
  { type: 'ASSIGNED_TO_ME', title: 'Assigned to Me', description: 'Issues assigned to you', icon: UserCheck, category: 'Issues' },
  { type: 'WATCHED_ISSUES', title: 'Watched Issues', description: 'Issues you are watching', icon: Eye, category: 'Issues' },
  { type: 'OVERDUE_ISSUES', title: 'Overdue Issues', description: 'Issues past their due date', icon: AlertTriangle, category: 'Issues' },
  { type: 'CUSTOM_FILTER', title: 'Custom Filter', description: 'Issues matching a custom filter', icon: Filter, category: 'Issues' },
  { type: 'ISSUES_BY_STATUS', title: 'Issues by Status', description: 'Pie chart of issue statuses', icon: PieChart, category: 'Issues' },
  { type: 'ISSUES_BY_PRIORITY', title: 'Issues by Priority', description: 'Breakdown by priority level', icon: PieChart, category: 'Issues' },
  { type: 'ISSUES_BY_TYPE', title: 'Issues by Type', description: 'Breakdown by issue type', icon: PieChart, category: 'Issues' },
  { type: 'PROJECT_PROGRESS', title: 'Project Progress', description: 'Overview of project completion', icon: FolderKanban, category: 'Activity' },
  { type: 'RECENT_ACTIVITY', title: 'Recent Activity', description: 'Latest activity feed', icon: Activity, category: 'Activity' },
  { type: 'SPRINT_BURNDOWN', title: 'Sprint Burndown', description: 'Active sprint burndown chart', icon: TrendingUp, category: 'Agile' },
  { type: 'CFD_MINI', title: 'Cumulative Flow', description: 'Mini CFD for a board', icon: AreaChart, category: 'Agile' },
  { type: 'VELOCITY_MINI', title: 'Velocity', description: 'Sprint velocity chart', icon: BarChart3, category: 'Agile' },
  { type: 'TIME_SPENT_TODAY', title: 'Time Spent Today', description: 'Your tracked time today', icon: Clock, category: 'Time' },
];

const CATEGORIES = ['Issues', 'Agile', 'Activity', 'Time'] as const;

export function AddWidgetDialog({ open, onOpenChange, dashboardId }: AddWidgetDialogProps) {
  const addWidget = useAddWidget(dashboardId);

  function handleAdd(option: WidgetOption) {
    addWidget.mutate(
      { type: option.type, title: option.title, config: {} },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>Choose a widget to add to your dashboard.</DialogDescription>
        </DialogHeader>
        <div className="max-h-100 overflow-y-auto space-y-4">
          {CATEGORIES.map((category) => {
            const options = WIDGET_OPTIONS.filter((o) => o.category === category);
            if (options.length === 0) return null;
            return (
              <div key={category}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {category}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {options.map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => handleAdd(option)}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border border-border p-3 text-left',
                        'hover:bg-accent/50 hover:border-accent transition-colors',
                      )}
                    >
                      <option.icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{option.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
