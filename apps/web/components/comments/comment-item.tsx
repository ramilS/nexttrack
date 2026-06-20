'use client';

import { useState, useMemo } from 'react';
import { MoreHorizontal, Pencil, Trash2, Reply } from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import { TiptapEditor } from '@/components/editor/tiptap-editor-lazy';
import { CommentForm } from './comment-form';
import type { TiptapDoc } from '@repo/shared/schemas';

const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [] };
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateComment, useDeleteComment } from '@/lib/hooks/use-comments';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useIsAdmin } from '@/lib/hooks/use-is-admin';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { Permission } from '@repo/shared';
import type { Comment } from '@/lib/api/comments.api';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RelativeTime } from '@/components/shared/relative-time';

interface CommentItemProps {
  comment: Comment;
  issueId: string;
  projectKey: string;
  /** Nesting depth — 0 for top-level, 1 for replies */
  depth?: number;
  className?: string;
}

export function CommentItem({ comment, issueId, projectKey, depth = 0, className }: CommentItemProps) {
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editContent, setEditContent] = useState<TiptapDoc>(comment.body ?? EMPTY_DOC);
  const updateComment = useUpdateComment(issueId);
  const deleteComment = useDeleteComment(issueId);
  const { data: members } = useProjectMembers(projectKey);
  const mentionUsers = useMemo(
    () => members
      ?.filter((m) => m.user.id !== user?.id)
      .map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl ?? undefined })) ?? [],
    [members, user?.id],
  );

  const hasEditOwnPermission = useHasPermission(Permission.COMMENT_EDIT_OWN);
  const hasCreatePermission = useHasPermission(Permission.COMMENT_CREATE);
  const isAdmin = useIsAdmin();
  const isOwner = user?.id === comment.author.id;
  const canModify = (isOwner && hasEditOwnPermission) || isAdmin;
  const canReply = depth === 0 && hasCreatePermission;

  function handleSaveEdit() {
    updateComment.mutate(
      { commentId: comment.id, data: { body: editContent } },
      { onSuccess: () => setEditing(false) },
    );
  }

  const [deleteOpen, setDeleteOpen] = useState(false);

  if (comment.isDeleted) {
    return (
      <div className={cn('py-3 border-b border-border last:border-b-0', className)}>
        <p className="text-sm text-muted-foreground italic">Comment deleted</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'group/comment py-4 border-b border-border last:border-b-0',
      depth > 0 && 'ml-8 border-l-2 border-l-border pl-4 border-b-0',
      className,
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserAvatar
            user={comment.author}
            size="sm"
            className="size-6"
          />
          <span className="text-sm font-medium">{comment.author.name}</span>
          <RelativeTime date={comment.createdAt} />
          {comment.editedAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {canReply && !editing && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Reply to comment"
              className="size-6 opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100"
              onClick={() => setReplying(!replying)}
            >
              <Reply className="size-3.5" />
            </Button>
          )}

          {canModify && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-xs" aria-label="Comment actions" className="size-6 opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100" />}
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && (
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <TiptapEditor
            content={comment.body ?? undefined}
            onChange={setEditContent}
            onSubmit={handleSaveEdit}
            mentionUsers={mentionUsers}
            minimal
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={updateComment.isPending}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <TiptapEditor content={comment.body ?? undefined} editable={false} className="border-0" />
      )}

      {/* Replies */}
      {comment.replies?.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              issueId={issueId}
              projectKey={projectKey}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Reply form */}
      {replying && (
        <div className="ml-8 mt-2 border-l-2 border-l-border pl-4">
          <CommentForm
            issueId={issueId}
            projectKey={projectKey}
            parentId={comment.id}
            placeholder="Write a reply..."
            onSuccess={() => setReplying(false)}
            compact
          />
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete comment"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteComment.mutate(comment.id)}
      />
    </div>
  );
}
