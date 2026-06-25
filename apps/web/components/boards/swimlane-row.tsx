'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { routes } from '@/lib/routes';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableCard } from './sortable-card';
import { InlineCreateIssue } from './inline-create-issue';
import type { BoardSwimlaneData, BoardIssueCard } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface SwimlaneRowProps {
  swimlane: BoardSwimlaneData;
  projectKey: string;
  sprintId?: string;
  swimlaneBy?: string;
  statusCategoryMap: Map<string, string>;
}

function extractAssigneeId(swimlane: BoardSwimlaneData, swimlaneBy?: string): string | null {
  if (swimlaneBy !== 'ASSIGNEE') return null;
  if (swimlane.groupKey.startsWith('user:') && swimlane.groupKey !== 'user:unassigned') {
    return swimlane.groupKey.replace('user:', '');
  }
  return null;
}

function extractParentId(swimlane: BoardSwimlaneData, swimlaneBy?: string): string | null {
  if (swimlaneBy !== 'EPIC') return null;
  if (swimlane.groupKey.startsWith('epic:') && swimlane.groupKey !== 'epic:none') {
    return swimlane.groupKey.replace('epic:', '');
  }
  return null;
}

function isColumnDone(statusIds: string[], categoryMap: Map<string, string>): boolean {
  return statusIds.some((id) => categoryMap.get(id) === 'DONE');
}

function areAllIssuesDone(swimlane: BoardSwimlaneData, categoryMap: Map<string, string>): boolean {
  const totalIssues = swimlane.columns.reduce((sum, col) => sum + col.issues.length, 0);
  if (totalIssues === 0) return false;

  return swimlane.columns.every(
    (col) => col.issues.length === 0 || isColumnDone(col.column.statusIds, categoryMap),
  );
}

export function SwimlaneRow({ swimlane, projectKey, sprintId, swimlaneBy, statusCategoryMap }: SwimlaneRowProps) {
  const [collapsed, setCollapsed] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: swimlane.groupKey,
    data: { type: 'swimlane', swimlane },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const totalIssues = swimlane.columns.reduce((sum, col) => sum + col.totalCount, 0);
  const allDone = areAllIssuesDone(swimlane, statusCategoryMap);
  const assigneeId = extractAssigneeId(swimlane, swimlaneBy);
  const parentId = extractParentId(swimlane, swimlaneBy);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="border-b border-border last:border-b-0">
      {/* Swimlane header */}
      <div className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-accent/30 transition-colors',
      )}>
        <div ref={setActivatorNodeRef} {...listeners} className="shrink-0 cursor-grab active:cursor-grabbing">
          <GripVertical className="size-3 text-muted-foreground/40" />
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 shrink-0" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0" />
          )}
        </button>
        {swimlane.issueNumber ? (
          <Link
            href={routes.project(projectKey).issues.detail(swimlane.issueNumber)}
            className={cn(
              'text-xs font-mono text-muted-foreground hover:text-foreground transition-colors',
              allDone && 'line-through',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {projectKey}-{swimlane.issueNumber}
          </Link>
        ) : null}
        <button
          type="button"
          className={cn(
            'text-xs font-semibold truncate',
            allDone && 'line-through',
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          {swimlane.groupLabel}
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{totalIssues} cards</span>
      </div>

      {/* Swimlane columns grid */}
      {!collapsed && (
        <div className="flex min-w-full">
          {swimlane.columns.map((colData, idx) => {
            const droppableId = `swimlane::${swimlane.groupKey}::column::${colData.column.id}`;
            return (
              <SwimlaneColumn
                key={colData.column.id}
                droppableId={droppableId}
                issues={colData.issues}
                projectKey={projectKey}
                sprintId={sprintId}
                statusId={colData.column.statusIds[0] ?? ''}
                assigneeId={assigneeId}
                parentId={parentId}
                isLast={idx === swimlane.columns.length - 1}
                isDone={isColumnDone(colData.column.statusIds, statusCategoryMap)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SwimlaneColumn({
  droppableId,
  issues,
  projectKey,
  sprintId,
  statusId,
  assigneeId,
  parentId,
  isLast,
  isDone,
}: {
  droppableId: string;
  issues: BoardIssueCard[];
  projectKey: string;
  sprintId?: string;
  statusId: string;
  assigneeId: string | null;
  parentId: string | null;
  isLast: boolean;
  isDone: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-40 min-h-12 p-1.5 space-y-1',
        !isLast && 'border-r border-border/40',
        isOver && 'bg-accent/20',
      )}
    >
      <SortableContext
        items={issues.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {issues.map((issue) => (
          <SortableCard
            key={issue.id}
            issue={issue}
            projectKey={projectKey}
            isDone={isDone}
          />
        ))}
      </SortableContext>

      <InlineCreateIssue
        projectKey={projectKey}
        statusId={statusId}
        assigneeId={assigneeId}
        parentId={parentId}
        sprintId={sprintId}
      />
    </div>
  );
}
