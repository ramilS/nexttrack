'use client';

import { format } from 'date-fns';
import { Input } from '@/components/ui/input';

interface DateFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  includeTime?: boolean;
  inline?: boolean;
}

export function DateFieldEditor({ value, onChange, includeTime, inline }: DateFieldEditorProps) {
  const type = includeTime ? 'datetime-local' : 'date';
  const displayFormat = includeTime ? 'MMM d, yyyy HH:mm' : 'MMM d, yyyy';

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val || null);
  }

  const inputValue = value
    ? includeTime
      ? value.slice(0, 16) // yyyy-MM-ddTHH:mm
      : value.slice(0, 10) // yyyy-MM-dd
    : '';

  return (
    <div className="relative">
      {!value ? (
        <div className="relative">
          <button
            className={inline
              ? 'w-full text-left text-xs px-1.5 py-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground'
              : 'w-full text-left text-sm px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground'
            }
            onClick={() => {
              const input = document.getElementById('cf-date-input') as HTMLInputElement;
              input?.showPicker?.();
            }}
          >
            Not set
          </button>
          <input
            id="cf-date-input"
            type={type}
            value={inputValue}
            onChange={handleChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className={inline ? 'text-xs px-1.5 py-1' : 'text-sm px-2 py-1'}>
            {format(new Date(value), displayFormat)}
          </span>
          <Input
            type={type}
            value={inputValue}
            onChange={handleChange}
            className="h-7 w-auto text-xs"
          />
          <button
            className="text-xs text-muted-foreground hover:text-foreground px-1"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
