import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface IssueListSkeletonProps {
  rows?: number;
  className?: string;
}

export function IssueListSkeleton({ rows = 8, className }: IssueListSkeletonProps) {
  return (
    <Card className={cn('gap-0 py-0 overflow-hidden', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid items-center border-b border-border last:border-b-0 px-4 py-2.5 grid-cols-[16px_20px_18px_auto_1fr_auto_auto_auto_28px_auto] gap-x-2.5"
        >
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="h-3.5 w-16 rounded" />
          <Skeleton className="h-3.5 w-full max-w-75 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
      ))}
    </Card>
  );
}
