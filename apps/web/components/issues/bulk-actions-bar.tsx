'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { useBulkUpdateIssues } from '@/lib/hooks/use-issues';
import { useWorkflowStatuses } from '@/lib/hooks/use-projects';
import { cn } from '@/lib/utils';
import type { IssuePriority } from '@repo/shared/schemas';

interface BulkActionsBarProps {
  projectKey: string;
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  className?: string;
}

export function BulkActionsBar({ projectKey, selectedCount, selectedIds, onClear, className }: BulkActionsBarProps) {
  const bulkUpdate = useBulkUpdateIssues();
  const { data: workflowStatuses } = useWorkflowStatuses(projectKey);

  function handleStatusChange(statusId: string) {
    bulkUpdate.mutate({ projectKey, issueIds: selectedIds, update: { statusId } });
    onClear();
  }

  function handlePriorityChange(priority: string) {
    bulkUpdate.mutate({ projectKey, issueIds: selectedIds, update: { priority: priority as IssuePriority } });
    onClear();
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2',
        className,
      )}
    >
      <span className="text-sm font-medium">
        {selectedCount} selected
      </span>

      <Select onValueChange={(v: string | null) => { if (v) handleStatusChange(v); }}>
        <SelectTrigger className="h-7 w-auto min-w-25 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {workflowStatuses?.map((status) => (
            <SelectItem key={status.id} value={status.id} label={status.name}>
              <StatusBadge status={status} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={(v: string | null) => { if (v) handlePriorityChange(v); }}>
        <SelectTrigger className="h-7 w-auto min-w-25 text-xs">
          <SelectValue placeholder="Priority">
            {(value: string | null) => {
              const priorityLabels: Record<string, string> = {
                URGENT: 'Urgent',
                HIGH: 'High',
                MEDIUM: 'Medium',
                LOW: 'Low',
              };
              return value ? priorityLabels[value] ?? value : 'Priority';
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="URGENT" label="Urgent">Urgent</SelectItem>
          <SelectItem value="HIGH" label="High">High</SelectItem>
          <SelectItem value="MEDIUM" label="Medium">Medium</SelectItem>
          <SelectItem value="LOW" label="Low">Low</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        onClick={onClear}
      >
        <X className="size-3" />
        Clear
      </Button>
    </div>
  );
}
