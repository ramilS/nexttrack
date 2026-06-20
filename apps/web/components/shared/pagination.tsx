'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total: number;
  limit: number;
  className?: string;
}

export function Pagination({ page: rawPage, totalPages, onPageChange, total, limit, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const page = Math.max(1, Math.min(rawPage, totalPages));
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className={cn('flex items-center justify-between text-sm text-muted-foreground', className)}>
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          className="size-7"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {generatePageNumbers(page, totalPages).map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1">
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon-xs"
              className="size-7 text-xs"
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-xs"
          className="size-7"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);

  return pages;
}
