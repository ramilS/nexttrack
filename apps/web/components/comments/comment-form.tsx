'use client';

import { useState, useCallback, useMemo } from 'react';
import { TiptapEditor, type JSONContent } from '@/components/editor/tiptap-editor-lazy';
import { Button } from '@/components/ui/button';
import { useCreateComment } from '@/lib/hooks/use-comments';
import { useProjectMembers } from '@/lib/hooks/use-projects';
import { useHasPermission } from '@/lib/hooks/use-permission';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Permission } from '@repo/shared';
import { Loader2 } from 'lucide-react';

interface CommentFormProps {
  issueId: string;
  projectKey: string;
  parentId?: string;
  placeholder?: string;
  onSuccess?: () => void;
  compact?: boolean;
}

const EMPTY_CONTENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function isEditorEmpty(json: JSONContent): boolean {
  if (!json.content || json.content.length === 0) return true;
  return json.content.every(
    (node) => node.type === 'paragraph' && (!node.content || node.content.length === 0),
  );
}

export function CommentForm({ issueId, projectKey, parentId, placeholder, onSuccess, compact }: CommentFormProps) {
  const canCreate = useHasPermission(Permission.COMMENT_CREATE);
  const [content, setContent] = useState<JSONContent>(EMPTY_CONTENT);
  const [key, setKey] = useState(0);
  const createComment = useCreateComment(issueId);
  const currentUser = useAuthStore((s) => s.user);
  const { data: members } = useProjectMembers(projectKey);
  const mentionUsers = useMemo(
    () => members
      ?.filter((m) => m.user.id !== currentUser?.id)
      .map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl ?? undefined })) ?? [],
    [members, currentUser?.id],
  );

  const handleSubmit = useCallback(() => {
    if (isEditorEmpty(content)) return;

    createComment.mutate(
      { body: content, parentId },
      {
        onSuccess: () => {
          setContent(EMPTY_CONTENT);
          setKey((k) => k + 1);
          onSuccess?.();
        },
      },
    );
  }, [content, createComment, parentId, onSuccess]);

  if (!canCreate) return null;

  return (
    <div className="space-y-2">
      <TiptapEditor
        key={key}
        content={EMPTY_CONTENT}
        onChange={setContent}
        onSubmit={handleSubmit}
        placeholder={placeholder ?? 'Add a comment... (Cmd+Enter to submit)'}
        mentionUsers={mentionUsers}
        minimal
        autoFocus={compact}
      />
      <div className="flex justify-end gap-2">
        {compact && onSuccess && (
          <Button variant="ghost" size="sm" onClick={onSuccess}>
            Cancel
          </Button>
        )}
        <Button
          size={compact ? 'xs' : 'sm'}
          onClick={handleSubmit}
          disabled={isEditorEmpty(content) || createComment.isPending}
        >
          {createComment.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
