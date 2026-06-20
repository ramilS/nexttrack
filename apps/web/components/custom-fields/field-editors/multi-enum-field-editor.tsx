'use client';

import { useState, useMemo } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { TagBadge } from '@/components/shared/tag-badge';
import { cn } from '@/lib/utils';

interface EnumOption {
  id: string;
  name: string;
  color?: string;
}

interface MultiEnumFieldEditorProps {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  options: EnumOption[];
  inline?: boolean;
}

export function MultiEnumFieldEditor({ value, onChange, options, inline }: MultiEnumFieldEditorProps) {
  const selected = value ?? [];
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(optionId: string) {
    const next = selected.includes(optionId)
      ? selected.filter((s) => s !== optionId)
      : [...selected, optionId];
    onChange(next.length > 0 ? next : null);
  }

  return (
    <div className="space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id);
            return (
              <TagBadge key={id} name={opt?.name ?? id} color={opt?.color ?? 'gray'} />
            );
          })}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className={inline
          ? 'h-7 border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50'
          : 'h-7 text-xs'
        } />}>
          <Plus className="size-3" />
          {selected.length === 0 ? 'Select' : 'Edit'}
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" align="start">
          <div className="p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto px-1 pb-1">
            {filtered.map((opt) => {
              const isChecked = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => toggle(opt.id)}
                >
                  <div className={cn(
                    'size-4 flex items-center justify-center rounded border',
                    isChecked ? 'bg-primary border-primary' : 'border-input',
                  )}>
                    {isChecked && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <TagBadge name={opt.name} color={opt.color ?? 'gray'} />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-xs text-center text-muted-foreground">No options</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
