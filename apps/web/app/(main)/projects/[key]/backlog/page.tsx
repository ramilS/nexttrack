'use client';

import { useParams } from 'next/navigation';
import { KanbanSquare } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { SprintBacklog } from '@/components/boards/sprint-backlog';
import { useBoards } from '@/lib/hooks/use-boards';
import { useCreateBoardStore } from '@/lib/stores/create-board.store';

export default function BacklogPage() {
  const { key } = useParams<{ key: string }>();
  const { data: boards } = useBoards(key);
  const openCreateBoard = useCreateBoardStore((s) => s.open);

  const scrumBoard = boards?.find((b) => b.type === 'SCRUM') ?? boards?.find((b) => b.isDefault);

  return (
    <div className="p-8">
      <PageHeader title="Backlog" description="Plan sprints and manage the product backlog." />
      <div className="mt-6">
        {scrumBoard ? (
          <SprintBacklog projectKey={key} boardId={scrumBoard.id} />
        ) : (
          <EmptyState
            icon={KanbanSquare}
            title="No board yet"
            description="Create a Scrum board to plan sprints and manage the backlog."
            action={{ label: 'Create board', onClick: () => openCreateBoard(key) }}
          />
        )}
      </div>
    </div>
  );
}
