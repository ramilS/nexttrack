'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';

interface PeriodFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  inline?: boolean;
}

/**
 * Period format: "2w 3d 4h" — weeks, days, hours.
 * Stored as-is (string), parsed by backend.
 */
export function PeriodFieldEditor({ value, onChange, inline }: PeriodFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    onChange(trimmed || null);
  }

  if (!editing) {
    return (
      <button
        className={inline
          ? 'w-full text-left text-xs px-1.5 py-1 rounded hover:bg-muted/50 transition-colors'
          : 'w-full text-left text-sm px-2 py-1 rounded hover:bg-accent transition-colors'
        }
        onClick={startEdit}
      >
        {value || <span className="text-muted-foreground">None</span>}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      placeholder="e.g. 2w 3d 4h"
      className={inline ? 'h-7 text-xs' : 'h-8 text-sm'}
    />
  );
}
