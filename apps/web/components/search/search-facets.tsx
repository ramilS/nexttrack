'use client';

import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import type { SearchResultItem } from '@/lib/api/search.api';
import { cn } from '@/lib/utils';

interface SearchFacetsProps {
  results: SearchResultItem[];
  activeFilters: {
    status: string | null;
    priority: string | null;
    type: string | null;
  };
  onFilterClick: (key: string, value: string) => void;
  className?: string;
}

interface FacetCount {
  value: string;
  count: number;
}

export function SearchFacets({ results, activeFilters, onFilterClick, className }: SearchFacetsProps) {
  // Compute facets from client-side results
  const statusCounts = computeFacets(results, (r) => r.issue.status.category);
  const priorityCounts = computeFacets(results, (r) => r.issue.priority);
  const typeCounts = computeFacets(results, (r) => r.issue.type);

  return (
    <aside className={cn('space-y-6', className)}>
      <FacetGroup
        title="Status"
        facets={statusCounts}
        activeValue={activeFilters.status}
        onSelect={(v) => onFilterClick('status', v)}
        renderLabel={(v) => <StatusBadge status={v} />}
      />
      <FacetGroup
        title="Priority"
        facets={priorityCounts}
        activeValue={activeFilters.priority}
        onSelect={(v) => onFilterClick('priority', v)}
        renderLabel={(v) => <PriorityBadge priority={v} />}
      />
      <FacetGroup
        title="Type"
        facets={typeCounts}
        activeValue={activeFilters.type}
        onSelect={(v) => onFilterClick('type', v)}
        renderLabel={(v) => (
          <span className="flex items-center gap-1.5">
            <IssueTypeIcon type={v} className="size-3.5" />
            <span className="text-xs capitalize">{v.toLowerCase()}</span>
          </span>
        )}
      />
    </aside>
  );
}

function FacetGroup({
  title,
  facets,
  activeValue,
  onSelect,
  renderLabel,
}: {
  title: string;
  facets: FacetCount[];
  activeValue: string | null;
  onSelect: (value: string) => void;
  renderLabel: (value: string) => React.ReactNode;
}) {
  if (facets.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="space-y-0.5">
        {facets.map(({ value, count }) => (
          <button
            key={value}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
              activeValue === value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
            onClick={() => onSelect(value)}
          >
            {renderLabel(value)}
            <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function computeFacets(results: SearchResultItem[], extractor: (r: SearchResultItem) => string): FacetCount[] {
  const map = new Map<string, number>();
  for (const r of results) {
    const val = extractor(r);
    map.set(val, (map.get(val) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
