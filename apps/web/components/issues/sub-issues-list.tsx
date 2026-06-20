'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { routes } from '@/lib/routes';
import { AsyncContent } from '@/components/shared/async-content';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useIssueChildren } from '@/lib/hooks/use-issues';
import { IssueCreateDialog } from './issue-create-dialog';
import { cn } from '@/lib/utils';

interface SubIssuesListProps {
  issueId: string;
  issueNumber: number;
  projectKey: string;
  childCount: number;
  className?: string;
  readOnly?: boolean;
}

export function SubIssuesList({ issueId, issueNumber, projectKey, childCount, className, readOnly }: SubIssuesListProps) {
  const [expanded, setExpanded] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: children, isLoading } = useIssueChildren(projectKey, issueNumber);

  if (readOnly && childCount === 0) return null;

  return (
    <>
    <Separator />
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => childCount > 0 && setExpanded(!expanded)}
        >
          {childCount > 0 && (expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />)}
          Sub-issues ({childCount})
        </button>
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3" />
          </Button>
        )}
      </div>

      {expanded && childCount > 0 && (
        <>
          <AsyncContent loading={isLoading} className="py-4" spinnerClassName="size-4">
            <div className="rounded-md border border-border overflow-hidden">
              {children?.map((child) => (
                <Link
                  key={child.id}
                  href={routes.project(projectKey).issues.detail(child.number)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                >
                  <PriorityBadge priority={child.priority} showLabel={false} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {projectKey}-{child.number}
                  </span>
                  <span className="truncate flex-1">{child.title}</span>
                  <StatusBadge status={child.status} />
                </Link>
              ))}
            </div>
          </AsyncContent>
        </>
      )}

      {!readOnly && (
        <IssueCreateDialog
          projectKey={projectKey}
          open={createOpen}
          onOpenChange={setCreateOpen}
          parentId={issueId}
        />
      )}
    </div>
    </>
  );
}
