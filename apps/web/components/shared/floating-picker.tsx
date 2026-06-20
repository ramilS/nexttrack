'use client';

import { useEffect, useRef } from 'react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import type { CommandOption } from '@/lib/commands/command-registry';

interface FloatingPickerProps {
  title: string;
  options: CommandOption[];
  currentValue?: string;
  onSelect: (optionId: string) => void;
  onClose: () => void;
}

export function FloatingPicker({
  title,
  options,
  currentValue,
  onSelect,
  onClose,
}: FloatingPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" aria-modal="true" role="dialog" aria-label={title}>
      <div className="flex justify-center pt-[20vh]">
        <div
          ref={ref}
          className="w-full max-w-md rounded-xl border border-border bg-popover shadow-2xl"
        >
          <Command>
            <div className="px-3 pt-2.5 pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {title}
              </span>
            </div>
            <CommandInput placeholder="Search..." autoFocus />
            <CommandList className="max-h-64">
              <CommandEmpty>No results</CommandEmpty>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={`${opt.label} ${(opt.keywords ?? []).join(' ')}`}
                  onSelect={() => {
                    onSelect(opt.id);
                    onClose();
                  }}
                  data-checked={opt.id === currentValue || undefined}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      </div>
    </div>
  );
}
