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
import { DurationInput, parseDuration, formatDuration } from '@/components/shared/duration-input';
import { useUpdateTimeLog } from '@/lib/hooks/use-time-tracking';
import type { TimeLogDto } from '@/lib/api/time-tracking.api';

interface EditTimeLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  log: TimeLogDto;
}

export function EditTimeLogDialog({ open, onOpenChange, issueId, log }: EditTimeLogDialogProps) {
  const [duration, setDuration] = useState(log.durationFormatted || formatDuration(log.duration));
  const [date, setDate] = useState(log.date.slice(0, 10));
  const [description, setDescription] = useState(log.description ?? '');
  const updateLog = useUpdateTimeLog(issueId);

  const parsed = parseDuration(duration);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;

    updateLog.mutate(
      {
        logId: log.id,
        data: {
          duration: parsed,
          date,
          description: description || null,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Time Log</DialogTitle>
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
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!parsed || updateLog.isPending}>
              {updateLog.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
