'use client';

import { useState, useMemo } from 'react';
import { LayoutList, LayoutGrid, Loader2, SearchX } from 'lucide-react';
import { QueryInput } from '@/components/filters/query-input';
import { SearchPresets } from './search-presets';
import { ActiveFilters } from './active-filters';
import { SearchResultRow } from './search-result-row';
import { SearchResultItemCard } from './search-result-item';
import { SearchFacets } from './search-facets';
import { LoadMoreButton } from '@/components/shared/load-more-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSearch } from '@/lib/hooks/use-search';
import { useSearchState } from '@/lib/hooks/use-search-state';
import { cn } from '@/lib/utils';

type ViewMode = 'rows' | 'cards';

interface SearchResultsProps {
  onHelpClick?: () => void;
}

export function SearchResults({ onHelpClick }: SearchResultsProps) {
  const searchState = useSearchState();
  const { fullQuery, status, priority, type, setFilter } = searchState;
  const [viewMode, setViewMode] = useState<ViewMode>('rows');

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSearch({
    q: fullQuery,
    pageSize: 20,
  });

  const results = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const meta = data?.pages[0]?.meta;

  function handleFacetClick(key: string, value: string) {
    const currentValue = searchState[key as keyof typeof searchState];
    setFilter(key as 'status' | 'priority' | 'type', currentValue === value ? null : value);
  }

  function handleRemoveFilter(key: string) {
    if (key === 'sortBy') {
      searchState.setFilters({ sortBy: 'updatedAt', sortOrder: 'desc' });
    } else {
      setFilter(key as 'status' | 'priority' | 'type' | 'assignee' | 'tag', null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Query input */}
      <QueryInput
        value={searchState.q ?? ''}
        onChange={(q) => searchState.setFilters({ q })}
        onSubmit={() => {}}
        onHelpClick={onHelpClick}
        autoFocus
      />

      {/* Presets */}
      <SearchPresets
        currentQuery={searchState.q ?? ''}
        onPresetClick={(q) => searchState.setFilters({ q })}
      />

      {/* Active filters */}
      <ActiveFilters
        filters={{
          status: searchState.status,
          priority: searchState.priority,
          assignee: searchState.assignee,
          type: searchState.type,
          tag: searchState.tag,
          sortBy: searchState.sortBy,
          sortOrder: searchState.sortOrder,
        }}
        onRemove={handleRemoveFilter}
        onClearAll={() => searchState.clearFilters()}
      />

      {/* Parse errors */}
      {meta?.query.errors && meta.query.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm text-destructive font-medium">Query syntax errors:</p>
          <ul className="mt-1 text-xs text-destructive/80 list-disc pl-4">
            {meta.query.errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {!fullQuery && !isLoading && (
        <div className="text-center py-16 space-y-3">
          <SearchX className="size-12 text-muted-foreground/30 mx-auto" />
          <h2 className="text-lg font-medium text-muted-foreground">Search across all issues</h2>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Try: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">status:open priority:high</code></p>
            <p>Or: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">#MyIssues sort:created:desc</code></p>
            <p>Or just type free text to search titles and descriptions</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && fullQuery && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <EmptyState
          title="Search failed"
          description="An error occurred while searching. Please try again."
        />
      )}

      {/* No results */}
      {!isLoading && fullQuery && results.length === 0 && !isError && (
        <EmptyState
          title="No results found"
          description="Try adjusting your search query or filters."
        />
      )}

      {/* Results */}
      {!isLoading && results.length > 0 && (
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            {/* Results header */}
            <div className="flex items-center justify-between">
              {meta && (
                <p className="text-xs text-muted-foreground">
                  {meta.total} result{meta.total !== 1 ? 's' : ''} in {meta.took}ms
                </p>
              )}
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn('size-7', viewMode === 'rows' && 'bg-accent')}
                  onClick={() => setViewMode('rows')}
                >
                  <LayoutList className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn('size-7', viewMode === 'cards' && 'bg-accent')}
                  onClick={() => setViewMode('cards')}
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Dense row view */}
            {viewMode === 'rows' && (
              <Card className="gap-0 py-0 overflow-hidden">
                {results.map((result) => (
                  <SearchResultRow key={result.issue.id} result={result} />
                ))}
              </Card>
            )}

            {/* Card view */}
            {viewMode === 'cards' && (
              <div className="space-y-3">
                {results.map((result) => (
                  <SearchResultItemCard key={result.issue.id} result={result} />
                ))}
              </div>
            )}

            <LoadMoreButton
              onClick={() => fetchNextPage()}
              isLoading={isFetchingNextPage}
              hasNextPage={hasNextPage}
            />
          </div>

          {/* Facets sidebar */}
          <SearchFacets
            results={results}
            activeFilters={{ status, priority, type }}
            onFilterClick={handleFacetClick}
            className="w-52 shrink-0 hidden lg:block"
          />
        </div>
      )}
    </div>
  );
}
