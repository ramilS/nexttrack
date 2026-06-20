'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DurationInput, parseDuration } from '@/components/shared/duration-input';
import { useCreateTimeLog } from '@/lib/hooks/use-time-tracking';

interface LogTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  issueKey: string;
}

export function LogTimeDialog({ open, onOpenChange, issueId, issueKey }: LogTimeDialogProps) {
  const [duration, setDuration] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const createLog = useCreateTimeLog(issueId);

  const parsed = parseDuration(duration);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;

    createLog.mutate(
      { duration: parsed, date, description: description || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setDuration('');
          setDescription('');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Time for {issueKey}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Duration</Label>
            <DurationInput value={duration} onChange={setDuration} autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Comment</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!parsed || createLog.isPending}>
              {createLog.isPending && <Loader2 className="size-4 animate-spin" />}
              Log Time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
