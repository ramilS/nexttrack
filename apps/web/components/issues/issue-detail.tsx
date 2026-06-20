'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Copy, Check, Loader2, Maximize2, Link2, Hash, Pencil, Eye } from 'lucide-react';
import { routes } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IssueTitleEditor } from './issue-title-editor';
import { IssueSidebar } from './issue-sidebar';
import { IssueActivity } from './issue-activity';
import { SubIssuesList } from './sub-issues-list';
import { IssueLinksSection } from './issue-links-section';
import { ProposedDocUpdate } from '@/components/ai-docs/proposed-doc-update';
import { FocusModeOverlay } from './focus-mode-overlay';
import { IssueKeyboardShortcuts } from './issue-keyboard-shortcuts';
import { TiptapEditor } from '@/components/editor/tiptap-editor-lazy';
import { AttachmentList } from '@/components/attachments/attachment-list';
import { useIssue, useUpdateIssue, useDeleteIssue } from '@/lib/hooks/use-issues';
import { useUploadAttachments } from '@/lib/hooks/use-attachments';
import { resolveApiUrl } from '@/lib/api/client';
import { useWorkflowStatuses, useProjectMembers, useProject } from '@/lib/hooks/use-projects';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { useTags } from '@/lib/hooks/use-tags';
import { Permission } from '@repo/shared';
import { CommandContextProvider } from '@/lib/commands/command-context';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useIsAdmin } from '@/lib/hooks/use-is-admin';
import { useIssueViewStore } from '@/lib/stores/issue-view.store';
import type { JSONContent } from '@tiptap/react';

interface IssueDetailProps {
  projectKey: string;
  issueNumber: number;
}

export function IssueDetail({ projectKey, issueNumber }: IssueDetailProps) {
  const { data: issue, isLoading, isError } = useIssue(projectKey, issueNumber);
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useIsAdmin();
  const toggleFocusMode = useIssueViewStore((s) => s.toggleFocusMode);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Sidebar metadata is always live-editable (Linear/YouTrack style), gated by permission —
  // not by the body's edit-mode toggle, which governs title/description/attachments only.
  const canEditFields = useHasPermission(Permission.ISSUE_UPDATE);

  // Fetch contextual data for command palette + keyboard shortcuts
  const { data: project } = useProject(projectKey);
  const { data: statuses } = useWorkflowStatuses(projectKey);
  const { data: members } = useProjectMembers(projectKey);
  const { data: tags } = useTags(projectKey);

  const handleTitleSave = useCallback(
    (title: string) => {
      if (issue) updateIssue.mutate({ projectKey, issueNumber, issueId: issue.id, data: { title } });
    },
    [issue, updateIssue, projectKey, issueNumber],
  );

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/projects/${projectKey}/issues/${issueNumber}`;
    copyToClipboard(url);
  }

  function handleCopyKeyWithTitle() {
    const text = `${projectKey}-${issueNumber} — ${issue?.title ?? ''}`;
    copyToClipboard(text);
  }

  function handleDelete() {
    if (!issue) return;
    setDeleteOpen(true);
  }

  if (isLoading) return <IssueDetailSkeleton />;

  if (isError || !issue) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-base font-medium">Issue not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectKey}-{issueNumber} does not exist or was deleted.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/projects/${projectKey}/issues`)}>
          Back to issues
        </Button>
      </div>
    );
  }

  return (
    <CommandContextProvider
      value={{
        activeIssue: issue,
        selectedIssueIds: [],
        currentProject: project ? { key: project.key, id: project.id } : null,
        currentUser: user,
      }}
    >
    <div className="p-6">
      <IssueKeyboardShortcuts
        issue={issue}
        projectKey={projectKey}
        statuses={statuses}
        members={members}
        tags={tags}
        onToggleEditing={() => setIsEditing((prev) => !prev)}
      />

      {/* Actions portalled next to breadcrumb issue key */}
      <BreadcrumbActions
        copied={copied}
        onCopyLink={handleCopyLink}
        onCopyKeyWithTitle={handleCopyKeyWithTitle}
        onToggleFocusMode={toggleFocusMode}
        isEditing={isEditing}
        onToggleEditing={() => setIsEditing((prev) => !prev)}
      />

      {/* Main content + sidebar */}
      <FocusModeOverlay>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        {/* Left — main content */}
        <div className="min-w-0 space-y-6">
          <IssueTitleEditor value={issue.title} onSave={handleTitleSave} readOnly={!isEditing} />

          {/* Parent link */}
          {issue.parent && (
            <div className="text-sm text-muted-foreground">
              Parent:{' '}
              <Link
                href={routes.project(projectKey).issues.detail(issue.parent.number)}
                className="text-primary hover:underline"
              >
                {projectKey}-{issue.parent.number}
              </Link>
              {issue.parent.title && ` — ${issue.parent.title}`}
            </div>
          )}

          {/* Description — Tiptap editor with auto-save */}
          <DescriptionEditor
            projectKey={projectKey}
            issueNumber={issueNumber}
            issueId={issue.id}
            content={issue.description as string | null}
            readOnly={!isEditing}
            mentionUsers={members?.filter((m) => m.user.id !== user?.id).map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl ?? undefined }))}
          />

          {/* Attachments */}
          <AttachmentList issueId={issue.id} readOnly={!isEditing} />

          {/* Sub-issues */}
          <SubIssuesList
            issueId={issue.id}
            issueNumber={issueNumber}
            projectKey={projectKey}
            childCount={issue.children?.length ?? 0}
            readOnly={!isEditing}
          />

          {/* Issue links */}
          <IssueLinksSection issueId={issue.id} projectKey={projectKey} readOnly={!isEditing} />

          {/* AI-proposed documentation update (only renders for doc-update issues) */}
          <ProposedDocUpdate issueId={issue.id} />

          <Separator />

          {/* Comments & Activity */}
          <IssueActivity projectKey={projectKey} issueNumber={issueNumber} issueId={issue.id} />
        </div>

        {/* Right — sidebar */}
        <IssueSidebar
          issue={issue}
          projectKey={projectKey}
          className="lg:sticky lg:top-6 self-start"
          readOnly={!canEditFields}
          onDelete={isEditing && (user?.id === issue.reporter?.id || isAdmin) ? handleDelete : undefined}
          isDeleting={deleteIssue.isPending}
        />
      </div>
      </FocusModeOverlay>
    </div>
    {issue && (
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${projectKey}-${issueNumber}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          deleteIssue.mutate({ projectKey, issueNumber: issue.number }, {
            onSuccess: () => router.push(`/projects/${projectKey}/issues`),
          });
        }}
      />
    )}
    </CommandContextProvider>
  );
}

function DescriptionEditor({ projectKey, issueNumber, issueId, content, readOnly, mentionUsers }: { projectKey: string; issueNumber: number; issueId: string; content: string | null; readOnly?: boolean; mentionUsers?: { id: string; name: string; avatarUrl?: string }[] }) {
  const updateIssue = useUpdateIssue();
  const mutateRef = useRef(updateIssue.mutate);
  mutateRef.current = updateIssue.mutate;
  const uploadAttachments = useUploadAttachments(issueId);
  const [saving, setSaving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = useCallback(
    (json: JSONContent) => {
      clearTimeout(timeoutRef.current);
      setSaving(true);
      timeoutRef.current = setTimeout(() => {
        mutateRef.current({ projectKey, issueNumber, issueId, data: { description: JSON.stringify(json) } });
        setSaving(false);
      }, 1000);
    },
    [projectKey, issueNumber, issueId],
  );

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      const { data } = await uploadAttachments.mutateAsync([file]);
      const downloadUrl = data[0]?.downloadUrl;
      return downloadUrl ? resolveApiUrl(downloadUrl) : '';
    },
    [uploadAttachments],
  );

  const parsedContent = (() => {
    if (!content) return undefined;
    try {
      return JSON.parse(content) as JSONContent;
    } catch {
      return content;
    }
  })();

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Description
          </span>
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
      )}
      <TiptapEditor
        content={parsedContent}
        onChange={readOnly ? undefined : handleChange}
        editable={!readOnly}
        placeholder="Add a description..."
        onImageUpload={readOnly ? undefined : handleImageUpload}
        mentionUsers={!readOnly ? mentionUsers : undefined}
      />
    </div>
  );
}

function BreadcrumbActions({
  copied,
  onCopyLink,
  onCopyKeyWithTitle,
  onToggleFocusMode,
  isEditing,
  onToggleEditing,
}: {
  copied: boolean;
  onCopyLink: () => void;
  onCopyKeyWithTitle: () => void;
  onToggleFocusMode: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById('breadcrumb-actions'));
  }, []);

  if (!container) return null;

  return createPortal(
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-6" aria-label="Copy issue reference" />}>
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4}>
          <DropdownMenuItem onClick={onCopyLink}>
            <Link2 className="size-3.5" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopyKeyWithTitle}>
            <Hash className="size-3.5" />
            Copy key and title
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="size-6" onClick={onToggleEditing} />}>
          {isEditing ? <Eye className="size-3" /> : <Pencil className="size-3" />}
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {isEditing ? 'View mode' : 'Edit mode'}
        </TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-xs" className="size-6" onClick={onToggleFocusMode} aria-label="Toggle focus mode">
        <Maximize2 className="size-3" />
      </Button>
    </div>,
    container,
  );
}

function IssueDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
