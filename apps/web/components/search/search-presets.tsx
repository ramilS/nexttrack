'use client';

import { User, AlertCircle, Clock, UserX, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchPresetsProps {
  currentQuery: string;
  onPresetClick: (query: string) => void;
  className?: string;
}

const PRESETS = [
  { query: '#MyIssues', label: 'My Issues', icon: User },
  { query: '#Unresolved', label: 'Unresolved', icon: AlertCircle },
  { query: '#Overdue', label: 'Overdue', icon: Clock },
  { query: '#Unassigned', label: 'Unassigned', icon: UserX },
  { query: 'status:DONE', label: 'Done', icon: CheckCircle },
] as const;

export function SearchPresets({ currentQuery, onPresetClick, className }: SearchPresetsProps) {
  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {PRESETS.map((preset) => {
        const isActive = currentQuery.includes(preset.query);
        const Icon = preset.icon;

        return (
          <button
            key={preset.query}
            onClick={() => {
              if (isActive) {
                onPresetClick(currentQuery.replace(preset.query, '').trim());
              } else {
                const newQuery = currentQuery.trim()
                  ? `${currentQuery.trim()} ${preset.query}`
                  : preset.query;
                onPresetClick(newQuery);
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-3" />
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
