'use client';

import { useRouter, useParams } from 'next/navigation';
import { routes } from '@/lib/routes';
import { SortAsc, SortDesc, LayoutList, Kanban, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIssueFilters } from '@/lib/hooks/use-issue-filters';
import { useIssueViewStore } from '@/lib/stores/issue-view.store';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Updated' },
  { value: 'createdAt', label: 'Created' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
];

interface FilterBarProps {
  className?: string;
}

export function FilterBar({ className }: FilterBarProps) {
  const [filters, setFilters] = useIssueFilters();
  const viewMode = useIssueViewStore((s) => s.viewMode);
  const setViewMode = useIssueViewStore((s) => s.setViewMode);
  const router = useRouter();
  const params = useParams<{ key: string }>();
  const [searchOpen, setSearchOpen] = useState(!!filters.search);

  function handleSortChange(value: string) {
    setFilters({ sortBy: value });
  }

  function toggleSortOrder() {
    setFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' });
  }

  function handleViewChange(mode: 'list' | 'board') {
    setViewMode(mode);
    if (mode === 'board' && params.key) {
      router.push(routes.project(params.key as string).board);
    }
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.value === filters.sortBy)?.label ?? 'Sort';

  return (
    <div className={cn('flex items-center gap-2 py-2', className)}>
      {searchOpen ? (
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Search issues..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ search: e.target.value || null, page: 1 })}
            className="h-7 w-48 text-xs"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7"
            onClick={() => {
              setSearchOpen(false);
              setFilters({ search: null });
            }}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-3" />
          Search
        </Button>
      )}

      <div className="flex-1" />

      <Select value={filters.sortBy ?? 'updatedAt'} onValueChange={(v: string | null) => { if (v) handleSortChange(v); }}>
        <SelectTrigger className="h-7 w-auto min-w-25 text-xs">
          <SelectValue>{sortLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="icon-xs" className="h-7 w-7" onClick={toggleSortOrder}>
        {filters.sortOrder === 'asc' ? (
          <SortAsc className="size-3.5" />
        ) : (
          <SortDesc className="size-3.5" />
        )}
      </Button>

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
  );
}
