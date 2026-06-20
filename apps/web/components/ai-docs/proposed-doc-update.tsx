'use client';

import { Sparkles, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TiptapEditor } from '@/components/editor/tiptap-editor';
import { RelativeTime } from '@/components/shared/relative-time';
import { useDocProposal } from '@/lib/hooks/use-ai-docs';
import type { DocProposalStatus } from '@repo/shared/schemas';

const STATUS: Record<
  DocProposalStatus,
  { label: string; variant: 'secondary' | 'default' | 'outline' }
> = {
  PENDING: { label: 'Pending review', variant: 'secondary' },
  ACCEPTED: { label: 'Applied', variant: 'default' },
  REJECTED: { label: 'Rejected', variant: 'outline' },
};

interface ProposedDocUpdateProps {
  issueId: string;
}

/** Shown on a doc-update issue: the AI-proposed documentation change awaiting Done/Cancel. */
export function ProposedDocUpdate({ issueId }: ProposedDocUpdateProps) {
  const { data: proposal } = useDocProposal(issueId);
  if (!proposal) return null;

  const status = STATUS[proposal.status];

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-muted/40 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          Proposed documentation update
        </CardTitle>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm text-muted-foreground">
          {proposal.targetArticleId
            ? 'Updates an existing article'
            : 'Creates a new article'}
          :{' '}
          <span className="font-medium text-foreground">
            {proposal.proposedTitle}
          </span>
        </p>

        {proposal.hasConflict && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-300">
            <TriangleAlert className="size-4 shrink-0" />
            The article changed after this draft was generated — the proposal was
            AI-reconciled and should be reviewed before applying.
          </div>
        )}

        <p className="text-sm">{proposal.rationale}</p>

        <div className="rounded-md border bg-background p-3">
          <TiptapEditor content={proposal.proposedContent} editable={false} minimal />
        </div>

        <p className="text-xs text-muted-foreground">
          Move this issue to Done to apply, or cancel it to discard. Proposed{' '}
          <RelativeTime date={proposal.createdAt} />.
        </p>
      </CardContent>
    </Card>
  );
}
