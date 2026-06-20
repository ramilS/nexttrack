'use client';

import { X } from 'lucide-react';
import type { IssueStatus } from '@repo/shared/schemas';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { cn } from '@/lib/utils';

interface ActiveFiltersProps {
  filters: {
    status: string | null;
    priority: string | null;
    assignee: string | null;
    type: string | null;
    tag: string | null;
    sortBy: string;
    sortOrder: string;
  };
  // Resolved status (for the chip colour); falls back to the bare name.
  statusOption?: IssueStatus | null;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilters({ filters, statusOption, onRemove, onClearAll, className }: ActiveFiltersProps) {
  const chips: { key: string; label: React.ReactNode }[] = [];

  if (filters.status) {
    chips.push({
      key: 'status',
      label: <StatusBadge status={statusOption ?? filters.status} />,
    });
  }

  if (filters.priority) {
    chips.push({
      key: 'priority',
      label: <PriorityBadge priority={filters.priority} />,
    });
  }

  if (filters.type) {
    chips.push({
      key: 'type',
      label: (
        <span className="flex items-center gap-1">
          <IssueTypeIcon type={filters.type} className="size-3" showTooltip={false} />
          <span className="capitalize">{filters.type.toLowerCase()}</span>
        </span>
      ),
    });
  }

  if (filters.assignee) {
    chips.push({
      key: 'assignee',
      label: (
        <span>
          Assignee: <span className="font-medium">{filters.assignee === 'me' ? 'Me' : filters.assignee}</span>
        </span>
      ),
    });
  }

  if (filters.tag) {
    chips.push({
      key: 'tag',
      label: (
        <span>
          Tag: <span className="font-medium">{filters.tag}</span>
        </span>
      ),
    });
  }

  if (filters.sortBy && filters.sortBy !== 'updatedAt') {
    chips.push({
      key: 'sortBy',
      label: (
        <span>
          Sort: {filters.sortBy} {filters.sortOrder === 'asc' ? '\u2191' : '\u2193'}
        </span>
      ),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs transition-colors hover:bg-muted"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
