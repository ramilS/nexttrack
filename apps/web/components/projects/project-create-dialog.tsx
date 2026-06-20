'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreateProject } from '@/lib/hooks/use-projects';
import { ColorPicker } from '@/components/shared/color-picker';
import { COLOR_PRESETS } from '@/lib/constants/color-presets';

interface ProjectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateKey(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5);
}

export function ProjectCreateDialog({ open, onOpenChange }: ProjectCreateDialogProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]!);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const createProject = useCreateProject();

  useEffect(() => {
    if (!keyEdited && name) {
      setKey(generateKey(name));
    }
  }, [name, keyEdited]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    createProject.mutate(
      {
        name: name.trim(),
        key: key.toUpperCase().trim(),
        color,
        description: description.trim() || undefined,
        isPrivate,
      },
      { onSuccess: () => handleClose() },
    );
  }

  function handleClose() {
    setName('');
    setKey('');
    setKeyEdited(false);
    setColor(COLOR_PRESETS[0]!);
    setDescription('');
    setIsPrivate(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="e.g. Backend API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              placeholder="e.g. BACK"
              value={key}
              onChange={(e) => {
                setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5));
                setKeyEdited(true);
              }}
              maxLength={5}
              className="uppercase font-mono"
            />
            <p className="text-xs text-muted-foreground">
              2-5 uppercase letters. Used as issue prefix (e.g. {key || 'KEY'}-1).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} aria-label="Project color" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-desc">Description</Label>
            <Textarea
              id="project-desc"
              placeholder="Optional project description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="project-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            <Label htmlFor="project-private" className="text-sm">
              Private project
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || key.length < 2 || createProject.isPending}
            >
              {createProject.isPending && <Loader2 className="size-4 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
