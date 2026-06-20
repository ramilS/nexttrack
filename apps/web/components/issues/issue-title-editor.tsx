'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface IssueTitleEditorProps {
  value: string;
  onSave: (title: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function IssueTitleEditor({ value, onSave, readOnly, className }: IssueTitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  }

  if (!readOnly && editing) {
    return (
      <textarea
        ref={inputRef}
        data-testid="issue-title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full resize-none bg-transparent text-xl font-semibold tracking-tight outline-none border-b-2 border-primary/30 py-1',
          className,
        )}
        rows={1}
      />
    );
  }

  return (
    <h1
      data-testid="issue-title"
      className={cn(
        'text-xl font-semibold tracking-tight py-1',
        !readOnly && 'cursor-text border-b-2 border-transparent hover:border-muted-foreground/20 transition-colors',
        className,
      )}
      onClick={readOnly ? undefined : () => setEditing(true)}
    >
      {value}
    </h1>
  );
}
