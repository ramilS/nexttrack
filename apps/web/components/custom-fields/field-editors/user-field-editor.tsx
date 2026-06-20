'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import { cn } from '@/lib/utils';

interface UserFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  projectKey: string;
  inline?: boolean;
}

export function UserFieldEditor({ value, onChange, projectKey, inline }: UserFieldEditorProps) {
  const { data: members } = useProjectMembers(projectKey);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!members) return [];
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((m) => m.user.name.toLowerCase().includes(q));
  }, [members, search]);

  const selectedMember = members?.find((m) => m.user.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className={inline
        ? 'h-7 w-full justify-start border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/50'
        : 'h-8 w-full justify-start text-xs'
      } />}>
        {selectedMember ? (
          <span className="flex items-center gap-2">
            <UserAvatar user={selectedMember.user} size="sm" className="size-5" />
            <span className="truncate">{selectedMember.user.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
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
          {value && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
          {filtered.map((member) => (
            <button
              key={member.user.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                member.user.id === value && 'bg-accent',
              )}
              onClick={() => { onChange(member.user.id); setOpen(false); }}
            >
              <UserAvatar user={member.user} size="sm" className="size-5" />
              <span className="truncate">{member.user.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
