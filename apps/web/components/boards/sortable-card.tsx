'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardCard } from './board-card';
import type { BoardIssueCard } from '@/lib/api/boards.api';

interface SortableCardProps {
  issue: BoardIssueCard;
  projectKey: string;
  isDone?: boolean;
}

export function SortableCard({ issue, projectKey, isDone }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { type: 'issue', issue },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BoardCard issue={issue} projectKey={projectKey} isDragging={isDragging} isDone={isDone} />
    </div>
  );
}
