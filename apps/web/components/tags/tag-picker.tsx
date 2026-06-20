'use client';

import { useState, useMemo } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { TagBadge } from '@/components/shared/tag-badge';
import { Separator } from '@/components/ui/separator';
import { useTags, useCreateTag } from '@/lib/hooks/use-tags';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import { cn } from '@/lib/utils';

interface TagPickerProps {
  projectKey: string;
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  className?: string;
}

export function TagPicker({ projectKey, selectedTagIds, onToggle, className }: TagPickerProps) {
  const { data: tags } = useTags(projectKey);
  const createTag = useCreateTag(projectKey);
  const canManageTags = useHasPermission(Permission.TAG_MANAGE);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!tags) return [];
    if (!search) return tags;
    const q = search.toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const canCreate = canManageTags && search.trim() && filtered.length === 0;

  function handleCreate() {
    createTag.mutate(
      { name: search.trim(), color: 'blue' },
      {
        onSuccess: (res) => {
          onToggle(res.data.id);
          setSearch('');
        },
      },
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className={cn('h-7 text-xs', className)} />}>
        <Plus className="size-3" />
        Add tag
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2">
          <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => onToggle(tag.id)}
              >
                <div className={cn('size-4 flex items-center justify-center rounded border', isSelected ? 'bg-primary border-primary' : 'border-input')}>
                  {isSelected && <Check className="size-3 text-primary-foreground" />}
                </div>
                <TagBadge name={tag.name} color={tag.color} />
              </button>
            );
          })}

          {canCreate && (
            <>
              <Separator className="my-1" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
                onClick={handleCreate}
              >
                <Plus className="size-3.5" />
                Create &quot;{search.trim()}&quot;
              </button>
            </>
          )}

          {!canCreate && filtered.length === 0 && (
            <p className="px-2 py-3 text-xs text-center text-muted-foreground">No tags found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
