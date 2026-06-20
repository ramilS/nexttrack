'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { IssueRow } from './issue-row';
import { IssueListSkeleton } from './issue-list-skeleton';
import { BulkActionsBar } from './bulk-actions-bar';
import { LoadMoreButton } from '@/components/shared/load-more-button';
import { EmptyState } from '@/components/shared/empty-state';
import { SearchFacets } from '@/components/search/search-facets';
import { useSearch } from '@/lib/hooks/use-search';
import { useSearchState } from '@/lib/hooks/use-search-state';
import { useProject } from '@/lib/hooks/use-projects';
import { useAuthStore } from '@/lib/stores/auth.store';
import { CommandContextProvider } from '@/lib/commands/command-context';
import type { SearchResultItem } from '@/lib/api/search.api';
import type { IssueRowData } from './issue-row';
import type { StatusCategory } from '@repo/shared/schemas';
import type { SearchFilters } from '@/components/filters/filter-sync';
import { ListChecks, Clock } from 'lucide-react';

interface IssueListProps {
  projectKey: string;
  onCreateIssue?: () => void;
}

const PAGE_SIZE = 25;

function searchResultToIssueRow(result: SearchResultItem, projectKey: string): IssueRowData {
  return {
    id: result.issue.id,
    projectKey,
    number: result.issue.number,
    title: result.issue.title,
    status: {
      ...result.issue.status,
      category: result.issue.status.category as StatusCategory,
    },
    priority: result.issue.priority,
    type: result.issue.type,
    assignee: result.issue.assignee,
    tags: result.issue.tags,
    sprintName: result.issue.sprintName,
    updatedAt: result.issue.updatedAt,
  };
}

export function IssueList({ projectKey, onCreateIssue }: IssueListProps) {
  const searchState = useSearchState();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: project, isLoading: isProjectLoading } = useProject(projectKey);
  const user = useAuthStore((s) => s.user);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearch({
    q: searchState.fullQuery,
    projectId: project?.id,
    pageSize: PAGE_SIZE,
  });

  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const firstPageMeta = data?.pages[0]?.meta;

  const toggleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleFacetClick = useCallback(
    (key: string, value: string) => {
      const currentValue = searchState[key as keyof typeof searchState];
      searchState.setFilter(key as keyof SearchFilters, currentValue === value ? null : value);
    },
    [searchState],
  );

  if (isProjectLoading || (isLoading && !data)) return <IssueListSkeleton />;

  if (isError) {
    return (
      <EmptyState
        title="Failed to load issues"
        description="Something went wrong. Please try again."
      />
    );
  }

  if (!data || allItems.length === 0) {
    const hasFilters = searchState.fullQuery.trim().length > 0 ||
      searchState.status || searchState.priority ||
      searchState.assignee || searchState.type || searchState.tag;
    return (
      <EmptyState
        icon={ListChecks}
        title={hasFilters ? 'No issues match your filters' : 'No issues yet'}
        description={
          hasFilters
            ? 'Try adjusting your filters or search query.'
            : 'Create your first issue to get started.'
        }
        action={
          !hasFilters && onCreateIssue
            ? { label: 'Create Issue', onClick: onCreateIssue }
            : undefined
        }
        shortcuts={hasFilters ? [
          { keys: ['⌘', '/'], label: 'Filter syntax help' },
          { keys: ['⌘', 'K'], label: 'Command palette' },
        ] : [
          { keys: ['C'], label: 'Create issue' },
          { keys: ['⌘', 'K'], label: 'Command palette' },
        ]}
      />
    );
  }

  const issues = allItems.map((item) => searchResultToIssueRow(item, projectKey));

  return (
    <CommandContextProvider
      value={{
        activeIssue: null,
        selectedIssueIds: Array.from(selectedIds),
        currentProject: project ? { key: project.key, id: project.id } : null,
        currentUser: user,
      }}
    >
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-3">
        {selectedIds.size > 0 && (
          <BulkActionsBar
            projectKey={projectKey}
            selectedCount={selectedIds.size}
            selectedIds={Array.from(selectedIds)}
            onClear={clearSelection}
          />
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {firstPageMeta && (
              <span>{firstPageMeta.total} issue{firstPageMeta.total !== 1 ? 's' : ''}</span>
            )}
            {firstPageMeta && firstPageMeta.took > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {firstPageMeta.took}ms
              </span>
            )}
          </div>
          {firstPageMeta?.query.errors && firstPageMeta.query.errors.length > 0 && (
            <div className="text-xs text-destructive">
              {firstPageMeta.query.errors.map((e, i) => (
                <span key={i}>{e.message}</span>
              ))}
            </div>
          )}
        </div>

        <Card className="gap-0 py-0 overflow-hidden">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              selected={selectedIds.has(issue.id)}
              onSelectChange={(selected) => toggleSelect(issue.id, selected)}
            />
          ))}
        </Card>

        <LoadMoreButton
          onClick={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
          hasNextPage={hasNextPage}
        />
      </div>

      <SearchFacets
        results={allItems}
        activeFilters={{
          status: searchState.status,
          priority: searchState.priority,
          type: searchState.type,
        }}
        onFilterClick={handleFacetClick}
        className="hidden lg:block w-48 shrink-0"
      />
    </div>
    </CommandContextProvider>
  );
}
