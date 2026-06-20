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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { Version } from '@/lib/api/versions.api';
import { dateInputToIsoOrUndefined, isoToDateInput } from '@/lib/dates';

interface VersionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string; releaseDate?: string }) => void;
  isPending?: boolean;
  defaultValues?: Version;
  title?: string;
}

export function VersionForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Create Version',
}: VersionFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [releaseDate, setReleaseDate] = useState(isoToDateInput(defaultValues?.releaseDate));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      releaseDate: dateInputToIsoOrUndefined(releaseDate),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ver-name">Name</Label>
            <Input
              id="ver-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. v1.0.0"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ver-desc">Description</Label>
            <Input
              id="ver-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ver-date">Release Date</Label>
            <Input
              id="ver-date"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {defaultValues ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
