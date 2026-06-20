'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  hasNextPage?: boolean;
  className?: string;
  label?: string;
}

export function LoadMoreButton({
  onClick,
  isLoading = false,
  hasNextPage = false,
  className,
  label = 'Load more',
}: LoadMoreButtonProps) {
  if (!hasNextPage) return null;

  return (
    <div className={cn('flex justify-center py-3', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="size-3.5 animate-spin mr-2" />
            Loading...
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}
