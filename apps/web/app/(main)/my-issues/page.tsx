'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RelativeTime } from '@/components/shared/relative-time';
import { ListChecks, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { TagBadge } from '@/components/shared/tag-badge';
import { ColorDot } from '@/components/shared/color-dot';
import { LoadMoreButton } from '@/components/shared/load-more-button';
import { EmptyState } from '@/components/shared/empty-state';
import { useSearch } from '@/lib/hooks/use-search';
import type { SearchResultItem } from '@/lib/api/search.api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

export default function MyIssuesPage() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearch({ q: '#myissues', pageSize: PAGE_SIZE });

  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  return (
    <div className="p-8 space-y-4">
      <PageHeader title="My Issues" description="Issues assigned to you across all projects." />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={ListChecks}
          title="Unable to load issues"
          description="Search service may be unavailable. Please ensure Elasticsearch is running and issues are indexed."
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No issues assigned"
          description="Issues assigned to you will appear here."
          shortcuts={[
            { keys: ['C'], label: 'Create issue' },
            { keys: ['⌘', 'K'], label: 'Command palette' },
          ]}
        />
      ) : (
        <>
          <Card className="gap-0 py-0 overflow-hidden">
            {allItems.map((result) => (
              <MyIssueRow key={result.issue.id} result={result} />
            ))}
          </Card>

          <LoadMoreButton
            onClick={() => fetchNextPage()}
            isLoading={isFetchingNextPage}
            hasNextPage={hasNextPage}
          />
        </>
      )}
    </div>
  );
}

function MyIssueRow({ result }: { result: SearchResultItem }) {
  const { issue } = result;
  const issueKey = `${issue.project.key}-${issue.number}`;
  const href = `/projects/${issue.project.key}/issues/${issue.number}`;

  return (
    <div
      className={cn(
        'group grid items-center border-b border-border last:border-b-0 px-4 py-2.5 transition-colors hover:bg-accent/50',
        'grid-cols-[20px_18px_auto_auto_1fr_auto_auto_100px]',
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
        {issue.title}
      </Link>

      <div className="flex items-center gap-1.5">
        {issue.tags?.map((tag) => (
          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>

      <StatusBadge status={issue.status} />

      <RelativeTime date={issue.updatedAt} className="whitespace-nowrap text-right" />
    </div>
  );
}
