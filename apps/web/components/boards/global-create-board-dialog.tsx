'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateBoardStore } from '@/lib/stores/create-board.store';
import { useCreateBoard } from '@/lib/hooks/use-boards';
import { routes } from '@/lib/routes';
import type { BoardType } from '@/lib/api/boards.api';

const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  KANBAN: 'Kanban',
  SCRUM: 'Scrum',
};

export function GlobalCreateBoardDialog() {
  const router = useRouter();
  const isOpen = useCreateBoardStore((s) => s.isOpen);
  const projectKey = useCreateBoardStore((s) => s.projectKey);
  const close = useCreateBoardStore((s) => s.close);

  const [name, setName] = useState('');
  const [type, setType] = useState<BoardType>('KANBAN');
  const createBoard = useCreateBoard(projectKey ?? '');

  function handleClose() {
    setName('');
    setType('KANBAN');
    close();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !projectKey) return;

    createBoard.mutate(
      { name: name.trim(), type },
      {
        onSuccess: () => {
          handleClose();
          router.push(routes.project(projectKey).board);
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Board</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="board-name">Name</Label>
            <Input
              id="board-name"
              placeholder="e.g. Engineering"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: string | null) => { if (v) setType(v as BoardType); }}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) => BOARD_TYPE_LABELS[(value as BoardType) ?? 'KANBAN']}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KANBAN" label={BOARD_TYPE_LABELS.KANBAN}>
                  {BOARD_TYPE_LABELS.KANBAN}
                </SelectItem>
                <SelectItem value="SCRUM" label={BOARD_TYPE_LABELS.SCRUM}>
                  {BOARD_TYPE_LABELS.SCRUM}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !projectKey || createBoard.isPending}>
              {createBoard.isPending && <Loader2 className="size-4 animate-spin" />}
              Create Board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
