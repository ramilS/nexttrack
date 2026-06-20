'use client';

import { useCallback, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { BoardIssueCard, BoardColumnData, BoardSwimlaneData } from '@/lib/api/boards.api';

interface UseBoardDndOptions {
  columns: BoardColumnData[];
  swimlanes?: BoardSwimlaneData[];
  onMoveIssue: (issueId: string, toStatusId: string, toParentId?: string | null) => void;
  onReorderSwimlanes?: (orderedKeys: string[]) => void;
}

type ActiveItem =
  | { type: 'issue'; issue: BoardIssueCard }
  | { type: 'swimlane'; swimlane: BoardSwimlaneData };

function extractColumnId(droppableId: string): string | undefined {
  // "swimlane::{groupKey}::column::{columnId}" or "column-{columnId}"
  const swimlaneParts = droppableId.split('::column::');
  if (swimlaneParts.length === 2) return swimlaneParts[1];

  if (droppableId.startsWith('column-')) return droppableId.replace('column-', '');

  return undefined;
}

function extractSwimlaneKey(droppableId: string): string | null {
  // "swimlane::{groupKey}::column::{columnId}"
  if (!droppableId.startsWith('swimlane::')) return null;
  const parts = droppableId.split('::column::');
  if (parts.length !== 2) return null;
  return parts[0]!.replace('swimlane::', '');
}

function parentIdFromSwimlaneKey(swimlaneKey: string | null): string | null | undefined {
  if (!swimlaneKey) return undefined; // no swimlane context → don't change parent
  if (swimlaneKey === 'epic:none') return null; // "Uncategorized" → remove parent
  if (swimlaneKey.startsWith('epic:')) return swimlaneKey.replace('epic:', '');
  return undefined;
}

function findIssueColumn(
  issueId: string,
  columns: BoardColumnData[],
  swimlanes: BoardSwimlaneData[],
): string | undefined {
  for (const col of columns) {
    if (col.issues.some((i) => i.id === issueId)) return col.column.id;
  }
  for (const lane of swimlanes) {
    for (const col of lane.columns) {
      if (col.issues.some((i) => i.id === issueId)) return col.column.id;
    }
  }
  return undefined;
}

function findIssueSwimlaneKey(
  issueId: string,
  swimlanes: BoardSwimlaneData[],
): string | null {
  for (const lane of swimlanes) {
    for (const col of lane.columns) {
      if (col.issues.some((i) => i.id === issueId)) return lane.groupKey;
    }
  }
  return null;
}

function findColumnData(
  columnId: string,
  columns: BoardColumnData[],
  swimlanes: BoardSwimlaneData[],
): BoardColumnData | undefined {
  const fromColumns = columns.find((c) => c.column.id === columnId);
  if (fromColumns) return fromColumns;

  for (const lane of swimlanes) {
    const found = lane.columns.find((c) => c.column.id === columnId);
    if (found) return found;
  }
  return undefined;
}

export function useBoardDnd({ columns, swimlanes = [], onMoveIssue, onReorderSwimlanes }: UseBoardDndOptions) {
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

  const activeIssue = activeItem?.type === 'issue' ? activeItem.issue : null;
  const activeSwimlane = activeItem?.type === 'swimlane' ? activeItem.swimlane : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'swimlane') {
      setActiveItem({ type: 'swimlane', swimlane: data.swimlane as BoardSwimlaneData });
    } else if (data?.type === 'issue') {
      setActiveItem({ type: 'issue', issue: data.issue as BoardIssueCard });
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentActive = activeItem;
      setActiveItem(null);
      const { active, over } = event;

      if (!over) return;

      // ── Swimlane reorder ──
      if (currentActive?.type === 'swimlane') {
        if (active.id === over.id) return;
        const oldIndex = swimlanes.findIndex((s) => s.groupKey === active.id);
        const newIndex = swimlanes.findIndex((s) => s.groupKey === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(swimlanes, oldIndex, newIndex);
        onReorderSwimlanes?.(reordered.map((s) => s.groupKey));
        return;
      }

      // ── Issue move (column + swimlane) ──
      const issueId = active.id as string;
      const overId = String(over.id);

      let targetColumnId = extractColumnId(overId);
      if (!targetColumnId) {
        targetColumnId = findIssueColumn(overId, columns, swimlanes);
      }
      if (!targetColumnId) return;

      const targetColumn = findColumnData(targetColumnId, columns, swimlanes);
      if (!targetColumn) return;

      const toStatusId = targetColumn.column.statusIds[0];
      if (!toStatusId) return;

      // Determine if swimlane changed
      const sourceSwimlaneKey = findIssueSwimlaneKey(issueId, swimlanes);
      const targetSwimlaneKey = extractSwimlaneKey(overId);

      const sourceColumnId = findIssueColumn(issueId, columns, swimlanes);
      const columnChanged = sourceColumnId !== targetColumnId;
      const swimlaneChanged = targetSwimlaneKey !== null && sourceSwimlaneKey !== targetSwimlaneKey;

      if (!columnChanged && !swimlaneChanged) return;

      const toParentId = swimlaneChanged
        ? parentIdFromSwimlaneKey(targetSwimlaneKey)
        : undefined;

      onMoveIssue(issueId, toStatusId, toParentId);
    },
    [columns, swimlanes, onMoveIssue, onReorderSwimlanes, activeItem],
  );

  const handleDragCancel = useCallback(() => {
    setActiveItem(null);
  }, []);

  return {
    activeIssue,
    activeSwimlane,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
