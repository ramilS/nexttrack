'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateIssue } from '@/lib/hooks/use-issues';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCreateIssueStore } from '@/lib/stores/create-issue.store';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { ColorDot } from '@/components/shared/color-dot';
import { ISSUE_TYPE_OPTIONS, ISSUE_PRIORITY_OPTIONS } from '@repo/shared';
import type { IssueType, IssuePriority } from '@repo/shared/schemas';

export function GlobalCreateIssueDialog() {
  const router = useRouter();
  const isOpen = useCreateIssueStore((s) => s.isOpen);
  const storeProjectKey = useCreateIssueStore((s) => s.projectKey);
  const defaults = useCreateIssueStore((s) => s.defaults);
  const close = useCreateIssueStore((s) => s.close);
  const { data: projectsData } = useProjects();
  const projects = projectsData?.items ?? [];

  const [selectedProjectKey, setSelectedProjectKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IssueType>('TASK');
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM');

  // Sync selected project and defaults from store
  useEffect(() => {
    if (isOpen) {
      const projectItems = projectsData?.items ?? [];
      if (storeProjectKey) {
        setSelectedProjectKey(storeProjectKey);
      } else if (projectItems.length > 0 && !selectedProjectKey) {
        setSelectedProjectKey(projectItems[0]!.key);
      }
      if (defaults?.type) {
        setType(defaults.type);
      }
    }
  }, [isOpen, storeProjectKey, defaults, projectsData?.items, selectedProjectKey]);

  const createIssue = useCreateIssue(selectedProjectKey);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('TASK' as IssueType);
    setPriority('MEDIUM' as IssuePriority);
  }, []);

  function handleClose() {
    resetForm();
    close();
  }

  function handleCreate(andOpen: boolean) {
    if (!title.trim() || !selectedProjectKey) return;

    createIssue.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
      },
      {
        onSuccess: (res) => {
          resetForm();
          close();
          if (andOpen) {
            router.push(`/projects/${selectedProjectKey}/issues/${res.data.number}`);
          }
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCreate(e.shiftKey);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project selector */}
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={selectedProjectKey}
              onValueChange={(v: string | null) => { if (v) setSelectedProjectKey(v); }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select project...">
                  {(value: string | null) => {
                    const p = projects.find((proj) => proj.key === value);
                    return p ? `${p.name} (${p.key})` : 'Select project...';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.key} value={p.key} label={`${p.name} (${p.key})`}>
                    <ColorDot color={p.color} size="sm" />
                    {p.name} ({p.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-issue-title">Title</Label>
            <Input
              id="global-issue-title"
              placeholder="Issue title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-issue-description">Description</Label>
            <Textarea
              id="global-issue-description"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: string | null) => { if (v) setType(v as IssueType); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = ISSUE_TYPE_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'Select type';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value} label={t.label}>
                      <IssueTypeIcon type={t.value} className="size-3.5" />
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: string | null) => { if (v) setPriority(v as IssuePriority); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = ISSUE_PRIORITY_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'Select priority';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value} label={p.label}>
                      <PriorityBadge priority={p.value} showLabel={false} />
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCreate(true)}
            disabled={!title.trim() || !selectedProjectKey || createIssue.isPending}
          >
            Create & Open
          </Button>
          <Button
            onClick={() => handleCreate(false)}
            disabled={!title.trim() || !selectedProjectKey || createIssue.isPending}
          >
            {createIssue.isPending && <Loader2 className="size-4 animate-spin" />}
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
