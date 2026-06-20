'use client';

import { useState } from 'react';
import { Check, Plus, Package } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useVersions } from '@/lib/hooks/use-versions';
import { cn } from '@/lib/utils';

interface MultiVersionFieldEditorProps {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  projectKey: string;
  inline?: boolean;
}

export function MultiVersionFieldEditor({ value, onChange, projectKey, inline }: MultiVersionFieldEditorProps) {
  const { data: versions } = useVersions(projectKey);
  const selected = value ?? [];
  const [open, setOpen] = useState(false);

  function toggle(versionId: string) {
    const next = selected.includes(versionId)
      ? selected.filter((id) => id !== versionId)
      : [...selected, versionId];
    onChange(next.length > 0 ? next : null);
  }

  const selectedVersions = versions?.filter((v) => selected.includes(v.id)) ?? [];

  return (
    <div className="space-y-1.5">
      {selectedVersions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedVersions.map((v) => (
            <div key={v.id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <Package className="size-3 text-muted-foreground" />
              <span className="text-xs">{v.name}</span>
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
        <PopoverContent className="w-52 p-0" align="start">
          <div className="max-h-48 overflow-y-auto px-1 py-1">
            {versions?.map((v) => {
              const isChecked = selected.includes(v.id);
              return (
                <button
                  key={v.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => toggle(v.id)}
                >
                  <div className={cn(
                    'size-4 flex items-center justify-center rounded border',
                    isChecked ? 'bg-primary border-primary' : 'border-input',
                  )}>
                    {isChecked && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <Package className="size-3 text-muted-foreground" />
                  <span className="truncate">{v.name}</span>
                </button>
              );
            })}
            {(!versions || versions.length === 0) && (
              <p className="px-2 py-3 text-xs text-center text-muted-foreground">No versions</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
