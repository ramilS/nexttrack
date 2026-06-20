'use client';

import { useState, useMemo } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import { cn } from '@/lib/utils';

interface MultiUserFieldEditorProps {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  projectKey: string;
  inline?: boolean;
}

export function MultiUserFieldEditor({ value, onChange, projectKey, inline }: MultiUserFieldEditorProps) {
  const { data: members } = useProjectMembers(projectKey);
  const selected = value ?? [];
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!members) return [];
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((m) => m.user.name.toLowerCase().includes(q));
  }, [members, search]);

  function toggle(userId: string) {
    const next = selected.includes(userId)
      ? selected.filter((id) => id !== userId)
      : [...selected, userId];
    onChange(next.length > 0 ? next : null);
  }

  const selectedMembers = members?.filter((m) => selected.includes(m.user.id)) ?? [];

  return (
    <div className="space-y-1.5">
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedMembers.map((m) => (
            <div key={m.user.id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <UserAvatar user={m.user} size="sm" className="size-4" />
              <span className="text-xs">{m.user.name}</span>
            </div>
          ))}
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
        <PopoverContent className="w-56 p-0" align="start">
          <div className="p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
                className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.map((member) => {
              const isChecked = selected.includes(member.user.id);
              return (
                <button
                  key={member.user.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => toggle(member.user.id)}
                >
                  <div className={cn(
                    'size-4 flex items-center justify-center rounded border',
                    isChecked ? 'bg-primary border-primary' : 'border-input',
                  )}>
                    {isChecked && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <UserAvatar user={member.user} size="sm" className="size-5" />
                  <span className="truncate">{member.user.name}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
