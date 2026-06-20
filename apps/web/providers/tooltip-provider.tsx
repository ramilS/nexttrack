'use client';

import { TooltipProvider as RadixTooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltipProvider delay={200}>
      {children}
    </RadixTooltipProvider>
  );
}
