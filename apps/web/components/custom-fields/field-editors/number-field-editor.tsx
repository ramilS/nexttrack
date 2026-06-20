'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';

interface NumberFieldEditorProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  unit?: string;
  inline?: boolean;
}

export function NumberFieldEditor({ value, onChange, min, max, unit, inline }: NumberFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    if (draft.trim() === '') {
      onChange(null);
      return;
    }
    const num = Number(draft);
    if (Number.isNaN(num)) return;
    if (min != null && num < min) return;
    if (max != null && num > max) return;
    onChange(num);
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
        {value != null ? (
          <span>{value}{unit ? ` ${unit}` : ''}</span>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      min={min}
      max={max}
      className={inline ? 'h-7 text-xs' : 'h-8 text-sm'}
    />
  );
}
