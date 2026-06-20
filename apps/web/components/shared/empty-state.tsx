import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from './kbd';

export interface ShortcutHint {
  keys: string[];
  label: string;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  shortcuts?: ShortcutHint[];
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, shortcuts, as: Heading = 'h3', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {Icon && (
        <div className="mb-4 rounded-xl bg-muted p-3">
          <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <Heading className="text-base font-medium">{title}</Heading>
      {description && (
        <p className="mt-1 max-w-100 text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4" size="sm">
          {action.label}
        </Button>
      )}
      {shortcuts && shortcuts.length > 0 && (
        <div className="mt-5 flex flex-col gap-2" role="list" aria-label="Keyboard shortcuts">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between gap-6 text-xs text-muted-foreground"
              role="listitem"
            >
              <span>{shortcut.label}</span>
              <Kbd keys={shortcut.keys} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
