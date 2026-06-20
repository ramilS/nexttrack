'use client';

import { useState, useCallback } from 'react';
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
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { ISSUE_TYPE_OPTIONS, ISSUE_PRIORITY_OPTIONS } from '@repo/shared';
import type { IssueType, IssuePriority } from '@repo/shared/schemas';

interface IssueCreateDialogProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId?: string;
}

export function IssueCreateDialog({ projectKey, open, onOpenChange, parentId }: IssueCreateDialogProps) {
  const router = useRouter();
  const createIssue = useCreateIssue(projectKey);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IssueType>('TASK');
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM');

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('TASK' as IssueType);
    setPriority('MEDIUM' as IssuePriority);
  }, []);

  function handleCreate(andOpen: boolean) {
    if (!title.trim()) return;

    createIssue.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        parentId: parentId ?? undefined,
      },
      {
        onSuccess: (res) => {
          resetForm();
          onOpenChange(false);
          if (andOpen) {
            router.push(`/projects/${projectKey}/issues/${res.data.number}`);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            Create Issue in {projectKey}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              placeholder="Issue title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
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
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCreate(true)}
            disabled={!title.trim() || createIssue.isPending}
          >
            Create & Open
          </Button>
          <Button
            onClick={() => handleCreate(false)}
            disabled={!title.trim() || createIssue.isPending}
          >
            {createIssue.isPending && <Loader2 className="size-4 animate-spin" />}
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
