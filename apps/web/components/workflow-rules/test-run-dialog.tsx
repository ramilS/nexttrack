'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface TestRunDialogProps {
  projectKey: string;
  ruleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Test run UI is being rebuilt — the previous version sent `{issueId}` but
 * the backend expects a full `{issue: {...}}` payload. The mismatch and the
 * planned redesign are tracked in Sprint 2 Group 14.
 */
export function TestRunDialog({ open, onOpenChange }: TestRunDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test Run</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Temporarily unavailable
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Rule testing is being rebuilt to send a proper issue snapshot
                instead of just an ID. Track in Group 14.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
