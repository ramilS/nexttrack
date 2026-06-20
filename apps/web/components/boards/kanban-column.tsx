'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SortableCard } from './sortable-card';
import { InlineCreateIssue } from './inline-create-issue';
import type { BoardColumnData } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  columnData: BoardColumnData;
  projectKey: string;
  boardId: string;
  sprintId?: string;
  statusCategory?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function KanbanColumn({ columnData, projectKey, boardId, sprintId, statusCategory, collapsed, onToggleCollapsed }: KanbanColumnProps) {
  const { column, issues, totalCount } = columnData;
  const isDone = statusCategory === 'DONE';

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id, statusIds: column.statusIds },
  });

  const wipLimit = column.wipLimit;
  const wipExceeded = wipLimit != null && totalCount > wipLimit;

  return (
    <div
      data-testid="board-column"
      className={cn(
        'flex flex-col rounded-md bg-muted/30 border border-border/40',
        collapsed ? 'w-9 shrink-0' : 'flex-1 min-w-40',
        isOver && 'ring-2 ring-primary/30',
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${column.name} column`}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-md border-b border-border/40 text-left transition-colors',
          wipExceeded && 'bg-destructive/10',
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-3 shrink-0" />
        ) : (
          <ChevronDown className="size-3 shrink-0" />
        )}

        {collapsed ? (
          <span
            className="text-[11px] font-semibold tracking-wider uppercase"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {column.name}
          </span>
        ) : (
          <>
            {column.color && (
              <div
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: column.color }}
              />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 truncate">
              {column.name}
            </span>
            <span className={cn(
              'text-[11px] tabular-nums',
              wipExceeded ? 'text-destructive font-bold' : 'text-muted-foreground',
            )}>
              {totalCount}{wipLimit != null ? `/${wipLimit}` : ''}
            </span>
          </>
        )}
      </button>

      {/* Issue list */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            'flex-1 p-1.5 space-y-1.5 min-h-15',
            wipExceeded && 'bg-destructive/5',
          )}
        >
          <SortableContext
            items={issues.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {issues.map((issue) => (
              <SortableCard key={issue.id} issue={issue} projectKey={projectKey} isDone={isDone} />
            ))}
          </SortableContext>

          {issues.length === 0 && (
            <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground/40">
              Drop issues here
            </div>
          )}

          {column.statusIds[0] && (
            <InlineCreateIssue
              projectKey={projectKey}
              boardId={boardId}
              statusId={column.statusIds[0]}
              sprintId={sprintId}
            />
          )}
        </div>
      )}
    </div>
  );
}
