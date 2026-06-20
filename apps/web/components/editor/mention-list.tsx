'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { UserAvatar } from '@/components/shared/user-avatar';
import { cn } from '@/lib/utils';

interface MentionItem {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }

        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }

        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) {
            command({ id: item.id, label: item.name });
          }
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-popover shadow-md p-2 text-xs text-muted-foreground">
          No results
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
            onClick={() => command({ id: item.id, label: item.name })}
          >
            <UserAvatar user={item} size="sm" className="size-5" />
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';
