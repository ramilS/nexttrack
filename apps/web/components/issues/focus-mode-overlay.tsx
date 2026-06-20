'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/shared/kbd';
import { useIssueViewStore } from '@/lib/stores/issue-view.store';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';

interface FocusModeOverlayProps {
  children: ReactNode;
}

export function FocusModeOverlay({ children }: FocusModeOverlayProps) {
  const isFocusMode = useIssueViewStore((s) => s.isFocusMode);
  const toggleFocusMode = useIssueViewStore((s) => s.toggleFocusMode);

  useKeyboardShortcut({ key: 'f', meta: true, shift: true }, toggleFocusMode);

  useEffect(() => {
    if (!isFocusMode) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleFocusMode();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFocusMode, toggleFocusMode]);

  if (!isFocusMode) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6 py-3">
        <span className="text-sm font-medium text-muted-foreground">Focus Mode</span>
        <div className="flex items-center gap-3">
          <Kbd keys={['Esc']} className="text-muted-foreground" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleFocusMode}>
            <X className="size-3.5" />
            Exit
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-240 p-6">
        {children}
      </div>
    </div>
  );
}
