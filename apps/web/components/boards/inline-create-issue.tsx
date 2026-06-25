'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useCreateIssue } from '@/lib/hooks/use-issues';
import { cn } from '@/lib/utils';

interface InlineCreateIssueProps {
  projectKey: string;
  statusId: string;
  assigneeId?: string | null;
  parentId?: string | null;
  sprintId?: string | null;
}

export function InlineCreateIssue({
  projectKey,
  statusId,
  assigneeId,
  parentId,
  sprintId,
}: InlineCreateIssueProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createIssue = useCreateIssue(projectKey);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    createIssue.mutate(
      {
        title: trimmed,
        statusId,
        assigneeId: assigneeId ?? undefined,
        parentId: parentId ?? undefined,
        sprintId: sprintId ?? undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          inputRef.current?.focus();
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setTitle('');
    }
  }

  function handleBlur() {
    if (!title.trim()) {
      setIsOpen(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 w-full px-1.5 py-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/30 rounded transition-colors"
      >
        <Plus className="size-3" />
      </button>
    );
  }

  return (
    <div className="px-1">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Issue title..."
        disabled={createIssue.isPending}
        className={cn(
          'w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm',
          'placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30',
          createIssue.isPending && 'opacity-50',
        )}
      />
    </div>
  );
}
