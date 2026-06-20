'use client';

import { useState, useEffect } from 'react';
import { Loader2, Archive, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { projectsApi } from '@/lib/api/projects.api';
import type { Project, UpdateProjectInput } from '@repo/shared/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '@/lib/hooks/use-projects';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/shared/color-picker';

interface ProjectSettingsFormProps {
  project: Project;
}

export function ProjectSettingsForm({ project }: ProjectSettingsFormProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState(project.color);
  const [isPrivate, setIsPrivate] = useState(project.isPrivate);
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
    setColor(project.color);
    setIsPrivate(project.isPrivate);
  }, [project]);

  async function handleSave() {
    setSaving(true);
    try {
      const data: UpdateProjectInput = {};
      if (name !== project.name) data.name = name;
      if (description !== (project.description ?? '')) data.description = description || undefined;
      if (color !== project.color) data.color = color;
      if (isPrivate !== project.isPrivate) data.isPrivate = isPrivate;

      await projectsApi.update(project.key, data);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    try {
      if (project.isArchived) {
        await projectsApi.unarchive(project.key);
        toast.success('Project unarchived');
      } else {
        await projectsApi.archive(project.key);
        toast.success('Project archived');
      }
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    } catch {
      toast.error('Operation failed');
    }
  }

  async function handleDelete() {
    try {
      await projectsApi.delete(project.key);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('Project deleted');
      router.push('/projects');
    } catch {
      toast.error('Failed to delete project');
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="settings-name">Name</Label>
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-desc">Description</Label>
          <Textarea
            id="settings-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <ColorPicker value={color} onChange={setColor} aria-label="Project color" />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="settings-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          <Label htmlFor="settings-private" className="text-sm">Private project</Label>
        </div>

        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save Changes
        </Button>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
            {project.isArchived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
            {project.isArchived ? 'Restore Project' : 'Archive Project'}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete Project
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={project.isArchived ? 'Restore this project?' : 'Archive this project?'}
        confirmLabel={project.isArchived ? 'Restore' : 'Archive'}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project"
        description="Permanently delete this project? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
