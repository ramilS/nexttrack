'use client';

import { useEffect, useState } from 'react';
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
import { ColorPicker } from '@/components/shared/color-picker';
import { COLOR_PRESETS } from '@/lib/constants/color-presets';

interface TagFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; color: string }) => void;
  isPending?: boolean;
  defaultValues?: { name: string; color: string };
  title?: string;
}

export function TagForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Create Tag',
}: TagFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [color, setColor] = useState(defaultValues?.color ?? COLOR_PRESETS[1]!);

  // The create dialog stays mounted across opens, so reseed fields each time it
  // opens — otherwise the previous session's input lingers on the next open.
  useEffect(() => {
    if (!open) return;
    setName(defaultValues?.name ?? '');
    setColor(defaultValues?.color ?? COLOR_PRESETS[1]!);
  }, [open, defaultValues?.name, defaultValues?.color]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), color });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tag name..."
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} aria-label="Tag color" />
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
