'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useCreateIssueLink } from '@/lib/hooks/use-issue-links';
import { issuesApi } from '@/lib/api/issues.api';
import type { IssueLinkType } from '@/lib/api/issue-links.api';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const LINK_TYPES: { value: IssueLinkType; label: string }[] = [
  { value: 'BLOCKS', label: 'Blocks' },
  { value: 'IS_BLOCKED_BY', label: 'Is blocked by' },
  { value: 'RELATES_TO', label: 'Relates to' },
  { value: 'DUPLICATES', label: 'Duplicates' },
  { value: 'IS_DUPLICATED_BY', label: 'Is duplicated by' },
];

interface AddLinkDialogProps {
  issueId: string;
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLinkDialog({ issueId, projectKey, open, onOpenChange }: AddLinkDialogProps) {
  const createLink = useCreateIssueLink(issueId);
  const [linkType, setLinkType] = useState<IssueLinkType>('RELATES_TO');
  const [search, setSearch] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['issue-link-search', projectKey, debouncedSearch],
    queryFn: () =>
      issuesApi
        .list({ projectKey, search: debouncedSearch, pageSize: 10 })
        .then((r) => r.data.items.filter((i) => i.id !== issueId)),
    enabled: !!debouncedSearch && open,
  });

  function resetForm() {
    setLinkType('RELATES_TO');
    setSearch('');
    setSelectedIssueId(null);
  }

  function handleSubmit() {
    if (!selectedIssueId) return;

    createLink.mutate(
      { type: linkType, targetIssueId: selectedIssueId },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Link</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Link Type</Label>
            <Select
              value={linkType}
              onValueChange={(v: string | null) => {
                if (v) setLinkType(v as IssueLinkType);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) => {
                    const opt = LINK_TYPES.find((o) => o.value === value);
                    return opt?.label ?? 'Select link type';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LINK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} label={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Search Issue</Label>
            <Input
              placeholder="Search by title or key..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {debouncedSearch && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {isSearching ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left border-b border-border last:border-b-0 transition-colors',
                      selectedIssueId === issue.id
                        ? 'bg-accent'
                        : 'hover:bg-accent/50',
                    )}
                    onClick={() => setSelectedIssueId(issue.id)}
                  >
                    <IssueTypeIcon type={issue.type} className="size-3.5 shrink-0" />
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {projectKey}-{issue.number}
                    </span>
                    <span className="truncate flex-1">{issue.title}</span>
                    <StatusBadge status={issue.status} />
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                  No issues found
                </p>
              )}
            </div>
          )}
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
            onClick={handleSubmit}
            disabled={!selectedIssueId || createLink.isPending}
          >
            {createLink.isPending && <Loader2 className="size-4 animate-spin" />}
            Add Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
