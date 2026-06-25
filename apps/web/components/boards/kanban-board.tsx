'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus } from 'lucide-react';
import { KanbanColumn } from './kanban-column';
import { SwimlaneRow } from './swimlane-row';
import { BoardCard } from './board-card';
import { useBoardData, useMoveIssue } from '@/lib/hooks/use-boards';
import { useWorkflowStatuses } from '@/lib/hooks/use-projects';
import { useBoardDnd } from '@/lib/hooks/use-board-dnd';
import { useCreateIssue } from '@/lib/hooks/use-issues';
import { EmptyState } from '@/components/shared/empty-state';
import type { SwimlaneBy, BoardSwimlaneData } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface KanbanBoardProps {
  projectKey: string;
  boardId: string;
  sprintId?: string;
  swimlaneBy?: SwimlaneBy;
}

const SWIMLANE_ORDER_KEY = (boardId: string) => `swimlane-order:${boardId}`;

function loadSwimlaneOrder(boardId: string): string[] | null {
  try {
    const raw = localStorage.getItem(SWIMLANE_ORDER_KEY(boardId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSwimlaneOrder(boardId: string, order: string[]) {
  try {
    localStorage.setItem(SWIMLANE_ORDER_KEY(boardId), JSON.stringify(order));
  } catch { /* ignore */ }
}

const COLLAPSED_KEY = (boardId: string) => `board-collapsed:${boardId}`;

function loadCollapsedColumns(boardId: string): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY(boardId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCollapsedColumns(boardId: string, ids: string[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY(boardId), JSON.stringify(ids));
  } catch { /* ignore */ }
}

function applySwimlaneOrder(swimlanes: BoardSwimlaneData[], savedOrder: string[] | null): BoardSwimlaneData[] {
  if (!savedOrder || savedOrder.length === 0) return swimlanes;
  const map = new Map(swimlanes.map((s) => [s.groupKey, s]));
  const ordered: BoardSwimlaneData[] = [];
  for (const key of savedOrder) {
    const s = map.get(key);
    if (s) {
      ordered.push(s);
      map.delete(key);
    }
  }
  // Append any new swimlanes not in saved order
  for (const s of map.values()) {
    ordered.push(s);
  }
  return ordered;
}

export function KanbanBoard({ projectKey, boardId, sprintId, swimlaneBy }: KanbanBoardProps) {
  const { data, isLoading, isError } = useBoardData(projectKey, boardId, {
    sprintId,
    swimlaneBy,
  });
  const { data: statuses } = useWorkflowStatuses(projectKey);

  const moveIssue = useMoveIssue(projectKey, boardId);
  const [swimlaneOrder, setSwimlaneOrder] = useState<string[] | null>(() => loadSwimlaneOrder(boardId));
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => new Set(loadCollapsedColumns(boardId)));

  const statusCategoryMap = new Map<string, string>();
  if (statuses) {
    for (const s of statuses) {
      statusCategoryMap.set(s.id, s.category);
    }
  }

  function getColumnCategory(statusIds: string[]): string | undefined {
    for (const id of statusIds) {
      const cat = statusCategoryMap.get(id);
      if (cat) return cat;
    }
    return undefined;
  }

  const columns = data?.columns ?? [];
  const sortedSwimlanes = useMemo(
    () => applySwimlaneOrder(data?.swimlanes ?? [], swimlaneOrder),
    [data?.swimlanes, swimlaneOrder],
  );
  const hasSwimlanes = swimlaneBy && swimlaneBy !== 'NONE' && sortedSwimlanes.length > 0;

  const handleReorderSwimlanes = useCallback((orderedKeys: string[]) => {
    setSwimlaneOrder(orderedKeys);
    saveSwimlaneOrder(boardId, orderedKeys);
  }, [boardId]);

  const toggleColumnCollapsed = useCallback((columnId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId); else next.add(columnId);
      saveCollapsedColumns(boardId, [...next]);
      return next;
    });
  }, [boardId]);

  const { activeIssue, activeSwimlane, handleDragStart, handleDragEnd, handleDragCancel } = useBoardDnd({
    columns,
    swimlanes: sortedSwimlanes,
    onMoveIssue: (issueId, toStatusId, toParentId) => {
      moveIssue.mutate({ issueId, toStatusId, toParentId });
    },
    onReorderSwimlanes: handleReorderSwimlanes,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const swimlaneIds = useMemo(
    () => sortedSwimlanes.map((s) => s.groupKey),
    [sortedSwimlanes],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <EmptyState title="Failed to load board" description="Please try again later." />;
  }

  if (!hasSwimlanes && columns.length === 0) {
    return (
      <EmptyState
        title="No columns"
        description="Configure board columns in settings."
        shortcuts={[
          { keys: ['C'], label: 'Create issue' },
          { keys: ['⌘', 'K'], label: 'Command palette' },
        ]}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {hasSwimlanes ? (
        <div className="min-w-full">
          {/* Sticky column headers */}
          <div className="flex border-b border-border sticky top-0 bg-background z-10 min-w-full">
            {data!.board.columns.map((col, idx) => (
              <div
                key={col.id}
                className={cn(
                  'flex-1 min-w-40 px-2.5 py-2 text-center',
                  idx < data!.board.columns.length - 1 && 'border-r border-border/40',
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.name}
                </span>
              </div>
            ))}
          </div>

          {/* Sortable swimlane rows */}
          <SortableContext items={swimlaneIds} strategy={verticalListSortingStrategy}>
            {sortedSwimlanes.map((swimlane) => (
              <SwimlaneRow
                key={swimlane.groupKey}
                swimlane={swimlane}
                projectKey={projectKey}
                sprintId={sprintId}
                swimlaneBy={swimlaneBy}
                statusCategoryMap={statusCategoryMap}
              />
            ))}
          </SortableContext>

          {/* Inline create swimlane (Story) — only in "By Story" mode */}
          {swimlaneBy === 'EPIC' && (
            <InlineCreateSwimlane projectKey={projectKey} />
          )}
        </div>
      ) : (
        <div className="flex gap-1.5 pb-2 min-h-full min-w-full">
          {columns.map((columnData) => (
            <KanbanColumn
              key={columnData.column.id}
              columnData={columnData}
              projectKey={projectKey}
              sprintId={sprintId}
              statusCategory={getColumnCategory(columnData.column.statusIds)}
              collapsed={collapsedColumns.has(columnData.column.id)}
              onToggleCollapsed={() => toggleColumnCollapsed(columnData.column.id)}
            />
          ))}
        </div>
      )}

      <DragOverlay dropAnimation={null}>
        {activeIssue && (
          <BoardCard
            issue={activeIssue}
            projectKey={projectKey}
            isDragging
            className="max-w-xs rotate-2"
          />
        )}
        {activeSwimlane && (
          <div className="rounded border border-border bg-card px-3 py-2 shadow-lg opacity-90">
            <span className="text-xs font-semibold">{activeSwimlane.groupLabel}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function InlineCreateSwimlane({ projectKey }: { projectKey: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const createIssue = useCreateIssue(projectKey);

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    createIssue.mutate(
      { title: trimmed, type: 'STORY' },
      {
        onSuccess: () => {
          setTitle('');
          setEditing(false);
        },
      },
    );
  }, [title, createIssue]);

  if (!editing) {
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 w-full px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
        onClick={() => setEditing(true)}
      >
        <Plus className="size-3" />
        New swimlane
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
      <input
        type="text"
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        placeholder="Story title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') { setTitle(''); setEditing(false); }
        }}
        onBlur={() => { if (!title.trim()) setEditing(false); }}
        autoFocus
      />
      {createIssue.isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
