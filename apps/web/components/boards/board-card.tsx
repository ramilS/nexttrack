'use client';

import { useRouter } from 'next/navigation';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { UserAvatar } from '@/components/shared/user-avatar';
import { TagBadge } from '@/components/shared/tag-badge';
import type { BoardIssueCard } from '@/lib/api/boards.api';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

interface BoardCardProps {
  issue: BoardIssueCard;
  projectKey: string;
  isDragging?: boolean;
  isDone?: boolean;
  className?: string;
}

export function BoardCard({ issue, projectKey, isDragging, isDone, className }: BoardCardProps) {
  const router = useRouter();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="board-card"
      className={cn(
        'rounded-md border border-border bg-card px-3 py-2 transition-shadow hover:shadow-sm cursor-pointer',
        isDragging && 'shadow-md ring-2 ring-primary/20 opacity-90',
        className,
      )}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        if (isDragging) return;
        if (pointerStart.current) {
          const dx = Math.abs(e.clientX - pointerStart.current.x);
          const dy = Math.abs(e.clientY - pointerStart.current.y);
          if (dx > 5 || dy > 5) return;
        }
        router.push(`/projects/${projectKey}/issues/${issue.number}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`/projects/${projectKey}/issues/${issue.number}`);
        }
      }}
    >
      {/* Line 1: Key + Title */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={cn(
          'shrink-0 text-[11px] font-mono font-medium text-muted-foreground',
          isDone && 'line-through',
        )}>
          {projectKey}-{issue.number}
        </span>
        <span className="text-sm font-medium leading-snug truncate">
          {issue.title}
        </span>
      </div>

      {/* Line 2: Description excerpt */}
      {issue.descriptionPreview && (
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {issue.descriptionPreview}
        </p>
      )}

      {/* Tags */}
      {issue.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {issue.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      )}

      {/* Line 3: Avatar + Priority + Type + Estimate */}
      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
        {issue.assignee ? (
          <UserAvatar
            user={issue.assignee}
            size="xxs"
          />
        ) : (
          <div className="size-4 rounded-full bg-muted" />
        )}
        <PriorityBadge priority={issue.priority} showLabel={false} className="[&_svg]:size-3" />
        <span className="flex items-center gap-0.5">
          <IssueTypeIcon type={issue.type} className="size-3" />
          <span className="capitalize">{issue.type.toLowerCase()}</span>
        </span>
        {issue.estimate != null && issue.estimate > 0 && (
          <span className="ml-auto tabular-nums">{issue.estimate}sp</span>
        )}
      </div>
    </div>
  );
}
