'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LayoutList, Kanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryInput } from '@/components/filters/query-input';
import { SyntaxHelpDialog } from '@/components/filters/syntax-help-dialog';
import { ActiveFilters } from '@/components/search/active-filters';
import { useSearchState } from '@/lib/hooks/use-search-state';
import type { SearchFilters } from '@/components/filters/filter-sync';
import { useWorkflows } from '@/lib/hooks/use-workflows';
import { useIssueViewStore } from '@/lib/stores/issue-view.store';
import { cn } from '@/lib/utils';

interface ProjectSearchBarProps {
  projectId: string;
  className?: string;
}

export function ProjectSearchBar({ projectId, className }: ProjectSearchBarProps) {
  const searchState = useSearchState();
  const [helpOpen, setHelpOpen] = useState(false);
  const viewMode = useIssueViewStore((s) => s.viewMode);
  const setViewMode = useIssueViewStore((s) => s.setViewMode);
  const router = useRouter();
  const params = useParams<{ key: string }>();
  const { data: workflows } = useWorkflows(params.key);

  const statusOption = (() => {
    if (!searchState.status) return null;
    const statuses = workflows?.find((w) => w.isDefault)?.statuses ?? [];
    return statuses.find((s) => s.name.toLowerCase() === searchState.status!.toLowerCase()) ?? null;
  })();

  function handleViewChange(mode: 'list' | 'board') {
    setViewMode(mode);
    if (mode === 'board' && params.key) {
      router.push(`/projects/${params.key}/board`);
    }
  }

  function handleRemoveFilter(key: string) {
    searchState.setFilter(key as keyof SearchFilters, null);
  }

  const hasActiveFilters = !!(
    searchState.status ||
    searchState.priority ||
    searchState.assignee ||
    searchState.type ||
    searchState.tag
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <QueryInput
          value={searchState.fullQuery}
          onChange={(value) => searchState.setQuery(value)}
          onSubmit={() => {}}
          onHelpClick={() => setHelpOpen(true)}
          projectId={projectId}
          placeholder="Search issues... (e.g. status:open priority:high assignee:{me})"
          className="flex-1"
        />

        <div className="flex items-center rounded-md border border-border">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon-xs"
            className="h-7 w-7 rounded-r-none"
            onClick={() => handleViewChange('list')}
          >
            <LayoutList className="size-3.5" />
          </Button>
          <Button
            variant={viewMode === 'board' ? 'secondary' : 'ghost'}
            size="icon-xs"
            className="h-7 w-7 rounded-l-none"
            onClick={() => handleViewChange('board')}
          >
            <Kanban className="size-3.5" />
          </Button>
        </div>
      </div>

      {hasActiveFilters && (
        <ActiveFilters
          filters={searchState}
          statusOption={statusOption}
          onRemove={handleRemoveFilter}
          onClearAll={searchState.clearFilters}
        />
      )}

      <SyntaxHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
