import { cn } from '@/lib/utils';
import type { IssueStatus } from '@repo/shared/schemas';

type StatusInput = IssueStatus | { id: string; name: string; category: string };

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  BACKLOG: { label: 'Backlog', className: 'bg-status-backlog' },
  OPEN: { label: 'Open', className: 'bg-status-todo' },
  TODO: { label: 'To Do', className: 'bg-status-todo' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-status-in-progress' },
  IN_REVIEW: { label: 'In Review', className: 'bg-status-in-review' },
  DONE: { label: 'Done', className: 'bg-status-done' },
  CANCELLED: { label: 'Cancelled', className: 'bg-status-cancelled' },
};

interface StatusBadgeProps {
  status: string | StatusInput | null | undefined;
  showLabel?: boolean;
  className?: string;
}

function resolveStatus(status: string | StatusInput | null | undefined): { category: string; label: string; color?: string } {
  if (!status) {
    return { category: '', label: 'Unknown' };
  }
  if (typeof status === 'string') {
    return { category: status, label: STATUS_CONFIG[status]?.label ?? status };
  }
  return { category: status.category, label: status.name, color: 'color' in status ? status.color : undefined };
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  const { category, label, color } = resolveStatus(status);
  const config = STATUS_CONFIG[category];
  const dotClassName = config?.className ?? 'bg-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn('size-2.5 rounded-full shrink-0', !color && dotClassName)}
        style={color ? { backgroundColor: color } : undefined}
      />
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{label}</span>
      )}
    </span>
  );
}
