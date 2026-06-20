'use client';

import { cn } from '@/lib/utils';

interface PresenceDotProps {
  online: boolean;
  className?: string;
}

export function PresenceDot({ online, className }: PresenceDotProps) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        online ? 'bg-green-500' : 'bg-muted-foreground/30',
        className,
      )}
    />
  );
}
