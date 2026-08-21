'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { IssuedApiKey } from '@repo/shared/schemas';

const COPY_FEEDBACK_MS = 2000;

interface ApiKeyCreatedDialogProps {
  /** The just-created key, `raw` included. `null` keeps the dialog closed. */
  apiKey: IssuedApiKey | null;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyCreatedDialog({ apiKey, onOpenChange }: ApiKeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  return (
    <Dialog open={apiKey !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>API key created</DialogTitle>
          <DialogDescription>This key won&apos;t be shown again.</DialogDescription>
        </DialogHeader>
        {apiKey && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code
                data-testid="api-key-secret"
                className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs"
              >
                {apiKey.raw}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={copied ? 'Copied' : 'Copy key'}
                onClick={handleCopy}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Store the key for <span className="font-medium text-foreground">{apiKey.name}</span> somewhere
              safe now — this is the only time it will be displayed.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
