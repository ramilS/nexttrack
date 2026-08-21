import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ServiceActorBadge({ className }: { className?: string }) {
  return (
    <span
      aria-label="Created by an integration"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5',
        'text-xs text-muted-foreground',
        className,
      )}
    >
      <Bot aria-hidden className="size-3" />
      Integration
    </span>
  );
}
