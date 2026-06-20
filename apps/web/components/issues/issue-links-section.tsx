'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { routes } from '@/lib/routes';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { useIssueLinks, useDeleteIssueLink } from '@/lib/hooks/use-issue-links';
import { LINK_TYPE_LABELS } from '@/lib/api/issue-links.api';
import { AddLinkDialog } from './add-link-dialog';
import { cn } from '@/lib/utils';

interface IssueLinksSectionProps {
  issueId: string;
  projectKey: string;
  className?: string;
  readOnly?: boolean;
}

export function IssueLinksSection({ issueId, projectKey, className, readOnly }: IssueLinksSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: groupedLinks, isLoading } = useIssueLinks(issueId);
  const deleteLink = useDeleteIssueLink(issueId);

  const totalCount = groupedLinks?.reduce((sum, group) => sum + group.links.length, 0) ?? 0;

  if (totalCount === 0 && !dialogOpen) {
    if (readOnly) return null;
    return (
      <>
      <Separator />
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-3" />
          Add link
        </Button>
        <AddLinkDialog
          issueId={issueId}
          projectKey={projectKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </div>
      </>
    );
  }

  return (
    <>
    <Separator />
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Links ({totalCount})
        </button>
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-3" />
          </Button>
        )}
      </div>

      {expanded && (
        <>
          <AsyncContent loading={isLoading} className="py-4" spinnerClassName="size-4">
            <div className="space-y-3">
              {groupedLinks?.map((group) => (
                <div key={group.type}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {LINK_TYPE_LABELS[group.type]}
                  </p>
                  <div className="rounded-md border border-border overflow-hidden">
                    {group.links.map((link) => (
                      <Link
                        key={link.id}
                        href={routes.project(link.linkedIssue.projectKey).issues.detail(link.linkedIssue.number)}
                        className="group/link flex items-center gap-2.5 px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                      >
                        <IssueTypeIcon type={link.linkedIssue.type} className="size-3.5 shrink-0" />
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {link.linkedIssue.projectKey}-{link.linkedIssue.number}
                        </span>
                        <span className="truncate flex-1">{link.linkedIssue.title}</span>
                        <StatusBadge status={link.linkedIssue.status} />
                        {!readOnly && (
                          <button
                            className="opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteLink.mutate(link.id);
                            }}
                          >
                            <X className="size-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AsyncContent>
        </>
      )}

      {!readOnly && (
        <AddLinkDialog
          issueId={issueId}
          projectKey={projectKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
    </>
  );
}
