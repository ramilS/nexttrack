'use client';

import Link from 'next/link';
import { RelativeTime } from '@/components/shared/relative-time';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { TagBadge } from '@/components/shared/tag-badge';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ColorDot } from '@/components/shared/color-dot';
import { HighlightedText } from './highlighted-text';
import type { SearchResultItem } from '@/lib/api/search.api';
import { cn } from '@/lib/utils';

interface SearchResultRowProps {
  result: SearchResultItem;
}

export function SearchResultRow({ result }: SearchResultRowProps) {
  const { issue, highlights } = result;
  const issueKey = `${issue.project.key}-${issue.number}`;
  const href = `/projects/${issue.project.key}/issues/${issue.number}`;

  return (
    <div
      className={cn(
        'group grid items-center border-b border-border last:border-b-0 px-4 py-2.5 transition-colors hover:bg-accent/50',
        'grid-cols-[20px_18px_auto_auto_1fr_auto_auto_28px_100px]',
        'gap-x-2.5',
      )}
    >
      <PriorityBadge priority={issue.priority} showLabel={false} />

      <IssueTypeIcon type={issue.type} className="size-3.5" />

      <Link
        href={href}
        className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
      >
        {issueKey}
      </Link>

      <div className="flex items-center gap-1">
        <ColorDot color={issue.project.color} size="sm" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{issue.project.name}</span>
      </div>

      <Link href={href} className="truncate text-sm hover:text-primary transition-colors">
        {highlights.title?.[0] ? (
          <HighlightedText html={highlights.title[0]} />
        ) : (
          issue.title
        )}
      </Link>

      <div className="flex items-center gap-1.5">
        {issue.tags?.map((tag) => (
          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>

      <StatusBadge status={issue.status} />

      {issue.assignee ? (
        <UserAvatar
          user={issue.assignee}
          size="sm"
          className="size-6"
        />
      ) : (
        <div className="size-6" />
      )}

      <RelativeTime date={issue.updatedAt} className="whitespace-nowrap text-right" />
    </div>
  );
}
