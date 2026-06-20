'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error in (main):', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
