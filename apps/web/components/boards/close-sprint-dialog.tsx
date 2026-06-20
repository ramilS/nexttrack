'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Sprint } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';

interface CloseSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint;
  nextSprints: Sprint[];
  onClose: (data: {
    incompleteIssuesAction: 'MOVE_TO_BACKLOG' | 'MOVE_TO_NEXT_SPRINT';
    nextSprintId?: string;
  }) => void;
  isPending?: boolean;
}

export function CloseSprintDialog({
  open,
  onOpenChange,
  sprint,
  nextSprints,
  onClose,
  isPending,
}: CloseSprintDialogProps) {
  const [action, setAction] = useState<'MOVE_TO_BACKLOG' | 'MOVE_TO_NEXT_SPRINT'>('MOVE_TO_BACKLOG');
  const [nextSprintId, setNextSprintId] = useState(nextSprints[0]?.id ?? '');

  const incompleteCount = sprint.totalIssues - sprint.completedIssues;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onClose({
      incompleteIssuesAction: action,
      nextSprintId: action === 'MOVE_TO_NEXT_SPRINT' ? nextSprintId : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Sprint: {sprint.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p><strong>{sprint.completedIssues}</strong> issues completed</p>
            {incompleteCount > 0 && (
              <p className="text-muted-foreground mt-1">
                <strong>{incompleteCount}</strong> issue{incompleteCount !== 1 ? 's' : ''} not finished
              </p>
            )}
          </div>

          {incompleteCount > 0 && (
            <div className="space-y-3">
              <Label>Move incomplete issues to:</Label>

              <label className={cn(
                'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                action === 'MOVE_TO_BACKLOG' && 'border-primary bg-primary/5',
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === 'MOVE_TO_BACKLOG'}
                  onChange={() => setAction('MOVE_TO_BACKLOG')}
                />
                <div>
                  <span className="text-sm font-medium">Backlog</span>
                  <p className="text-xs text-muted-foreground">Issues will be unassigned from any sprint</p>
                </div>
              </label>

              {nextSprints.length > 0 && (
                <label className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  action === 'MOVE_TO_NEXT_SPRINT' && 'border-primary bg-primary/5',
                )}>
                  <input
                    type="radio"
                    name="action"
                    checked={action === 'MOVE_TO_NEXT_SPRINT'}
                    onChange={() => setAction('MOVE_TO_NEXT_SPRINT')}
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium">Next sprint</span>
                    {nextSprints.length > 1 && (
                      <select
                        value={nextSprintId}
                        onChange={(e) => setNextSprintId(e.target.value)}
                        className="mt-1 block w-full text-xs bg-transparent border border-input rounded px-2 py-1"
                      >
                        {nextSprints.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    {nextSprints.length === 1 && (
                      <p className="text-xs text-muted-foreground">{nextSprints[0]!.name}</p>
                    )}
                  </div>
                </label>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Complete Sprint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
