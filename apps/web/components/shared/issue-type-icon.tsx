import {
  CheckSquare,
  Bug,
  BookOpen,
  Layers,
  Lightbulb,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  TASK: { icon: CheckSquare, label: 'Task', className: 'text-info' },
  BUG: { icon: Bug, label: 'Bug', className: 'text-destructive' },
  STORY: { icon: BookOpen, label: 'Story', className: 'text-success' },
  EPIC: { icon: Layers, label: 'Epic', className: 'text-chart-1' },
  FEATURE: { icon: Lightbulb, label: 'Feature', className: 'text-warning' },
};

interface IssueTypeIconProps {
  type: string;
  className?: string;
  showTooltip?: boolean;
}

export function IssueTypeIcon({ type, className, showTooltip = true }: IssueTypeIconProps) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.TASK!;
  const Icon = config.icon;

  if (!showTooltip) {
    return <Icon className={cn('size-4', config.className, className)} aria-label={config.label} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Icon className={cn('size-4', config.className, className)} aria-hidden="true" />
        <span className="sr-only">{config.label}</span>
      </TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  );
}
