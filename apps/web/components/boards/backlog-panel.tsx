'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, X, Loader2 } from 'lucide-react';
import { routes } from '@/lib/routes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { LoadMoreButton } from '@/components/shared/load-more-button';
import { useBacklogIssues, useAddIssuesToSprint } from '@/lib/hooks/use-sprints';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { BoardIssueCard } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface BacklogPanelProps {
  boardId: string;
  projectKey: string;
  currentSprintId: string | undefined;
  currentSprintName: string | undefined;
  open: boolean;
  onClose: () => void;
}

export function BacklogPanel({
  boardId,
  projectKey,
  currentSprintId,
  currentSprintName,
  open,
  onClose,
}: BacklogPanelProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useBacklogIssues(boardId, {
    search: debouncedSearch || undefined,
    enabled: open,
  });
  const addIssues = useAddIssuesToSprint(boardId);
  const [addingIssueIds, setAddingIssueIds] = useState<Set<string>>(new Set());

  const handleAddToSprint = useCallback(
    (issueId: string) => {
      if (!currentSprintId) return;
      setAddingIssueIds((prev) => new Set(prev).add(issueId));
      addIssues.mutate(
        { sprintId: currentSprintId, issueIds: [issueId] },
        {
          onSettled: () => {
            setAddingIssueIds((prev) => {
              const next = new Set(prev);
              next.delete(issueId);
              return next;
            });
          },
        },
      );
    },
    [currentSprintId, addIssues],
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Close on click outside the panel (the header toggle handles its own state)
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-backlog-toggle]')) return;
      onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onClose]);

  const backlogIssues = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute left-0 top-0 bottom-0 z-30 flex flex-col w-80 border-r border-border bg-background shadow-lg transition-transform duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold">Backlog</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close backlog">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search backlog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Target sprint indicator */}
      {currentSprintName && (
        <div className="px-3 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[11px] text-muted-foreground">
            Add to: <span className="font-medium text-foreground">{currentSprintName}</span>
          </span>
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : backlogIssues.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {search ? 'No matching issues' : 'Backlog is empty'}
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {backlogIssues.map((issue) => (
                <BacklogIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  canAdd={!!currentSprintId}
                  isAdding={addingIssueIds.has(issue.id)}
                  onAdd={() => handleAddToSprint(issue.id)}
                />
              ))}
            </div>
            <LoadMoreButton
              onClick={() => fetchNextPage()}
              isLoading={isFetchingNextPage}
              hasNextPage={hasNextPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface BacklogIssueRowProps {
  issue: BoardIssueCard;
  projectKey: string;
  canAdd: boolean;
  isAdding: boolean;
  onAdd: () => void;
}

function BacklogIssueRow({ issue, projectKey, canAdd, isAdding, onAdd }: BacklogIssueRowProps) {
  return (
    <div className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors">
      <IssueTypeIcon type={issue.type} className="size-3.5 shrink-0" showTooltip={false} />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1 min-w-0">
          <Link
            href={routes.project(projectKey).issues.detail(issue.number)}
            className="shrink-0 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {projectKey}-{issue.number}
          </Link>
          <span className="text-xs font-medium truncate">{issue.title}</span>
        </div>
      </div>

      <PriorityBadge priority={issue.priority} showLabel={false} className="shrink-0 [&_svg]:size-3" />

      {canAdd && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  'shrink-0 p-0.5 rounded text-muted-foreground transition-colors',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  'hover:text-foreground hover:bg-muted',
                  isAdding && 'opacity-100',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                disabled={isAdding}
                aria-label={`Add ${projectKey}-${issue.number} to sprint`}
              />
            }
          >
            {isAdding ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent side="right">Add to sprint</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
