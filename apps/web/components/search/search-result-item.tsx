'use client';

import Link from 'next/link';
import { routes } from '@/lib/routes';
import { RelativeTime } from '@/components/shared/relative-time';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { TagBadge } from '@/components/shared/tag-badge';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ColorDot } from '@/components/shared/color-dot';
import { HighlightedText } from './highlighted-text';
import type { SearchResultItem } from '@/lib/api/search.api';

interface SearchResultItemCardProps {
  result: SearchResultItem;
}

export function SearchResultItemCard({ result }: SearchResultItemCardProps) {
  const { issue, highlights } = result;
  const issueKey = `${issue.project.key}-${issue.number}`;

  return (
    <Link
      href={routes.project(issue.project.key).issues.detail(issue.number)}
      className="block rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <IssueTypeIcon type={issue.type} className="size-4 mt-0.5 shrink-0" />

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header row */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{issueKey}</span>
            <div className="flex items-center gap-1">
              <ColorDot color={issue.project.color} size="sm" />
              <span className="text-xs text-muted-foreground">{issue.project.name}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-medium">
            {highlights.title?.[0] ? (
              <HighlightedText html={highlights.title[0]} />
            ) : (
              issue.title
            )}
          </h3>

          {/* Description snippet */}
          {highlights.description?.[0] && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              <HighlightedText html={highlights.description[0]} />
            </p>
          )}

          {/* Comment snippet */}
          {highlights.commentBodies?.[0] && (
            <p className="text-xs text-muted-foreground italic line-clamp-1">
              <span className="font-medium not-italic">Comment: </span>
              <HighlightedText html={highlights.commentBodies[0]} />
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />

            {issue.tags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} />
            ))}

            <RelativeTime date={issue.updatedAt} className="ml-auto" />

            {issue.assignee && (
              <UserAvatar
                user={issue.assignee}
                size="sm"
                className="size-5"
              />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
