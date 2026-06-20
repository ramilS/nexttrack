import {
  SignalHigh,
  SignalMedium,
  SignalLow,
  AlertTriangle,
  Minus,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  CRITICAL: { label: 'Critical', icon: AlertTriangle, className: 'text-priority-urgent' },
  URGENT: { label: 'Urgent', icon: AlertTriangle, className: 'text-priority-urgent' },
  HIGH: { label: 'High', icon: SignalHigh, className: 'text-priority-high' },
  MEDIUM: { label: 'Medium', icon: SignalMedium, className: 'text-priority-medium' },
  LOW: { label: 'Low', icon: SignalLow, className: 'text-priority-low' },
  NONE: { label: 'None', icon: Minus, className: 'text-priority-none' },
};

interface PriorityBadgeProps {
  priority: string;
  showLabel?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.NONE!;
  const Icon = config.icon;
  const showTooltip = !showLabel;

  const badge = (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`Priority: ${config.label}`}>
      <Icon className={cn('size-4', config.className)} aria-hidden="true" />
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
      )}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{badge}</TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  );
}
