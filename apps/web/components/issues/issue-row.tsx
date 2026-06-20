'use client';

import Link from 'next/link';
import { RelativeTime } from '@/components/shared/relative-time';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { TagBadge } from '@/components/shared/tag-badge';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IterationCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IssueStatus } from '@repo/shared/schemas';

export interface IssueRowData {
  id: string;
  projectKey: string;
  number: number;
  title: string;
  status: string | IssueStatus;
  priority: string;
  type: string;
  assignee?: { name: string; avatarUrl?: string | null } | null;
  tags?: { name: string; color: string }[];
  sprintName?: string | null;
  updatedAt: string;
}

interface IssueRowProps {
  issue: IssueRowData;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  className?: string;
}

export function IssueRow({ issue, selected, onSelectChange, className }: IssueRowProps) {
  const issueHref = `/projects/${issue.projectKey}/issues/${issue.number}`;

  return (
    <div
      data-testid="issue-row"
      className={cn(
        'group grid items-center border-b border-border last:border-b-0 px-4 py-2.5 transition-colors hover:bg-accent/50',
        'grid-cols-[16px_20px_18px_auto_1fr_auto_auto_auto_28px_auto]',
        'gap-x-2.5',
        selected && 'bg-primary/5',
        className
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(v) => onSelectChange?.(!!v)}
        className="size-3.5 opacity-0 group-hover:opacity-100 data-[checked]:opacity-100 transition-opacity"
      />

      <PriorityBadge priority={issue.priority} showLabel={false} />

      <IssueTypeIcon type={issue.type} className="size-3.5" />

      <span
        aria-hidden="true"
        className="font-mono text-xs text-muted-foreground whitespace-nowrap"
      >
        {issue.projectKey}-{issue.number}
      </span>

      <Link
        href={issueHref}
        aria-label={`${issue.projectKey}-${issue.number}: ${issue.title}`}
        className="truncate text-sm hover:text-primary transition-colors"
      >
        {issue.title}
      </Link>

      <div className="flex items-center gap-1.5">
        {issue.tags?.map((tag) => (
          <TagBadge key={`${tag.name}-${tag.color}`} name={tag.name} color={tag.color} />
        ))}
      </div>

      {issue.sprintName ? (
        <Tooltip>
          <TooltipTrigger render={<span />} className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-28">
            <IterationCcw className="size-3 shrink-0" />
            <span className="truncate">{issue.sprintName}</span>
          </TooltipTrigger>
          <TooltipContent>{issue.sprintName}</TooltipContent>
        </Tooltip>
      ) : (
        <span />
      )}

      <StatusBadge status={issue.status} />

      {issue.assignee ? (
        <UserAvatar
          user={issue.assignee}
          size="xs"
        />
      ) : (
        <div className="size-6" />
      )}

      <RelativeTime
        date={issue.updatedAt}
        className="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
      />
    </div>
  );
}
