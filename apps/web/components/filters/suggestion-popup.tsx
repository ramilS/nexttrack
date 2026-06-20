'use client';

import { useRef, useEffect } from 'react';
import { Hash, Columns3, Tag, Zap } from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import type { AutocompleteSuggestion } from '@/lib/api/search.api';
import { cn } from '@/lib/utils';

interface SuggestionPopupProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  FIELD: Columns3,
  VALUE: Tag,
  HASHTAG: Hash,
  KEYWORD: Zap,
};

export function SuggestionPopup({ suggestions, selectedIndex, onSelect }: SuggestionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={listRef}
      className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
    >
      {suggestions.map((suggestion, index) => {
        const Icon = TYPE_ICON[suggestion.type] ?? Tag;

        return (
          <button
            key={`${suggestion.type}-${suggestion.label}-${index}`}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
            onMouseDown={(e) => {
              e.preventDefault(); // prevent blur
              onSelect(suggestion);
            }}
          >
            {suggestion.avatarUrl ? (
              <UserAvatar
                user={{ name: suggestion.description ?? suggestion.label, avatarUrl: suggestion.avatarUrl }}
                size="sm"
                className="size-5"
              />
            ) : suggestion.color ? (
              <div
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: suggestion.color }}
              />
            ) : (
              <Icon className="size-3.5 text-muted-foreground shrink-0" />
            )}

            <div className="flex-1 min-w-0 text-left">
              <span className="truncate">{suggestion.label}</span>
              {suggestion.description && (
                <span className="ml-2 text-xs text-muted-foreground">{suggestion.description}</span>
              )}
            </div>

            <span className="text-[10px] text-muted-foreground uppercase shrink-0">
              {suggestion.type.toLowerCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
