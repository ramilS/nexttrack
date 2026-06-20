'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateSprint } from '@/lib/hooks/use-sprints';
import { dateInputToIsoOrUndefined } from '@/lib/dates';

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  suggestedName: string;
}

export function CreateSprintDialog({ open, onOpenChange, boardId, suggestedName }: CreateSprintDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const createSprint = useCreateSprint(boardId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    createSprint.mutate(
      {
        name: name.trim(),
        goal: goal.trim() || undefined,
        startDate: dateInputToIsoOrUndefined(startDate),
        endDate: dateInputToIsoOrUndefined(endDate),
      },
      { onSuccess: () => handleClose() },
    );
  }

  function handleClose() {
    setName(suggestedName);
    setGoal('');
    setStartDate('');
    setEndDate('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Sprint</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Name</Label>
            <Input
              id="sprint-name"
              placeholder="e.g. Sprint 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Goal (optional)</Label>
            <Textarea
              id="sprint-goal"
              placeholder="What should this sprint achieve?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sprint-start">Start Date</Label>
              <Input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-end">End Date</Label>
              <Input
                id="sprint-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createSprint.isPending}>
              {createSprint.isPending && <Loader2 className="size-4 animate-spin" />}
              Create Sprint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
