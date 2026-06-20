'use client';

import { useState, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface UrlFieldEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  inline?: boolean;
}

export function UrlFieldEditor({ value, onChange, placeholder, inline }: UrlFieldEditorProps) {
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
          ? 'w-full text-left text-xs px-1.5 py-1 rounded hover:bg-muted/50 transition-colors truncate flex items-center gap-1.5'
          : 'w-full text-left text-sm px-2 py-1 rounded hover:bg-accent transition-colors truncate flex items-center gap-1.5'
        }
        onClick={startEdit}
      >
        {value ? (
          <>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-primary underline underline-offset-2">{value}</span>
          </>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="url"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      placeholder={placeholder ?? 'https://...'}
      className={inline ? 'h-7 text-xs' : 'h-8 text-sm'}
    />
  );
}
