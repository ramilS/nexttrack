import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardDnd } from './use-board-dnd';
import type { BoardColumnData, BoardIssueCard } from '@/lib/api/boards.api';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

function buildColumn(id: string, statusIds: string[], issues: Partial<BoardIssueCard>[] = []): BoardColumnData {
  return {
    column: { id, name: `Col ${id}`, statusIds, ordinal: 0 },
    issues: issues.map((i) => ({
      id: 'issue-1',
      number: 1,
      title: 'Test',
      type: 'TASK',
      priority: 'MEDIUM',
      statusId: statusIds[0]!,
      projectId: 'p1',
      assigneeId: null,
      parentId: null,
      sprintId: null,
      estimate: null,
      spent: 0,
      dueDate: null,
      isOverdue: false,
      commentsCount: 0,
      hasAttachments: false,
      childrenCount: 0,
      completedChildrenCount: 0,
      descriptionPreview: null,
      assignee: null,
      tags: [],
      ...i,
    })),
    totalCount: issues.length,
    isOverWip: false,
  };
}

function issueStartEvent(issue: BoardIssueCard) {
  return {
    active: { id: issue.id, data: { current: { type: 'issue', issue } } },
  } as unknown as DragStartEvent;
}

describe('useBoardDnd', () => {
  const onMoveIssue = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('sets activeIssue on drag start', () => {
    const columns = [buildColumn('c1', ['s1'], [{ id: 'i1' }])];
    const issue = columns[0]!.issues[0];
    const { result } = renderHook(() =>
      useBoardDnd({ columns, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(issue!));
    });

    expect(result.current.activeIssue).toEqual(issue);
  });

  it('clears activeIssue on drag cancel', () => {
    const columns = [buildColumn('c1', ['s1'], [{ id: 'i1' }])];
    const { result } = renderHook(() =>
      useBoardDnd({ columns, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(columns[0]!.issues[0]!));
    });

    act(() => result.current.handleDragCancel());
    expect(result.current.activeIssue).toBeNull();
  });

  it('calls onMoveIssue when dropped on different column', () => {
    const columns = [
      buildColumn('c1', ['s1'], [{ id: 'i1' }]),
      buildColumn('c2', ['s2']),
    ];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(columns[0]!.issues[0]!));
    });

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'i1' },
        over: { id: 'column-c2' },
      } as unknown as DragEndEvent);
    });

    expect(onMoveIssue).toHaveBeenCalledWith('i1', 's2', undefined);
  });

  it('does not call onMoveIssue when dropped on same column', () => {
    const columns = [
      buildColumn('c1', ['s1'], [{ id: 'i1' }]),
    ];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(columns[0]!.issues[0]!));
    });

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'i1' },
        over: { id: 'column-c1' },
      } as unknown as DragEndEvent);
    });

    expect(onMoveIssue).not.toHaveBeenCalled();
  });

  it('does not call onMoveIssue when dropped on nothing', () => {
    const columns = [buildColumn('c1', ['s1'], [{ id: 'i1' }])];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'i1' },
        over: null,
      } as unknown as DragEndEvent);
    });

    expect(onMoveIssue).not.toHaveBeenCalled();
  });

  it('resolves column from swimlane droppable ID', () => {
    const columns: BoardColumnData[] = [];
    const swimlanes = [{
      groupKey: 'epic:parent-1',
      groupLabel: 'Story 1',
      columns: [
        buildColumn('c1', ['s1'], [{ id: 'i1' }]),
        buildColumn('c2', ['s2']),
      ],
    }];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, swimlanes, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(swimlanes[0]!.columns[0]!.issues[0]!));
    });

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'i1' },
        over: { id: 'swimlane::epic:parent-1::column::c2' },
      } as unknown as DragEndEvent);
    });

    // Same swimlane, different column — no parent change
    expect(onMoveIssue).toHaveBeenCalledWith('i1', 's2', undefined);
  });

  it('detects cross-swimlane drop and passes toParentId', () => {
    const columns: BoardColumnData[] = [];
    const swimlanes = [
      {
        groupKey: 'epic:parent-1',
        groupLabel: 'Story 1',
        columns: [buildColumn('c1', ['s1'], [{ id: 'i1' }])],
      },
      {
        groupKey: 'epic:parent-2',
        groupLabel: 'Story 2',
        columns: [buildColumn('c1', ['s1'])],
      },
    ];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, swimlanes, onMoveIssue }),
    );

    act(() => {
      result.current.handleDragStart(issueStartEvent(swimlanes[0]!.columns[0]!.issues[0]!));
    });

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'i1' },
        over: { id: 'swimlane::epic:parent-2::column::c1' },
      } as unknown as DragEndEvent);
    });

    expect(onMoveIssue).toHaveBeenCalledWith('i1', 's1', 'parent-2');
  });

  it('reorders swimlanes', () => {
    const onReorderSwimlanes = vi.fn();
    const columns: BoardColumnData[] = [];
    const swimlanes = [
      { groupKey: 'epic:a', groupLabel: 'A', columns: [] },
      { groupKey: 'epic:b', groupLabel: 'B', columns: [] },
    ];

    const { result } = renderHook(() =>
      useBoardDnd({ columns, swimlanes, onMoveIssue, onReorderSwimlanes }),
    );

    act(() => {
      result.current.handleDragStart({
        active: { id: 'epic:a', data: { current: { type: 'swimlane', swimlane: swimlanes[0] } } },
      } as unknown as DragStartEvent);
    });

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'epic:a' },
        over: { id: 'epic:b' },
      } as unknown as DragEndEvent);
    });

    expect(onReorderSwimlanes).toHaveBeenCalledWith(['epic:b', 'epic:a']);
  });
});
