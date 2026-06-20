'use client';

import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { TiptapEditor, type JSONContent } from '@/components/editor/tiptap-editor-lazy';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useArticleComments, useCreateArticleComment } from '@/lib/hooks/use-articles';
import { RelativeTime } from '@/components/shared/relative-time';

interface ArticleCommentsProps {
  projectKey: string;
  articleId: string;
}

const EMPTY_CONTENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function isEditorEmpty(json: JSONContent): boolean {
  if (!json.content || json.content.length === 0) return true;
  return json.content.every(
    (node) => node.type === 'paragraph' && (!node.content || node.content.length === 0),
  );
}

export function ArticleComments({ projectKey, articleId }: ArticleCommentsProps) {
  const { data, isLoading } = useArticleComments(projectKey, articleId);
  const comments = data?.items ?? [];
  const createComment = useCreateArticleComment(projectKey, articleId);
  const [content, setContent] = useState<JSONContent>(EMPTY_CONTENT);
  const [key, setKey] = useState(0);

  const handleSubmit = useCallback(() => {
    if (isEditorEmpty(content)) return;

    createComment.mutate(
      { body: content },
      {
        onSuccess: () => {
          setContent(EMPTY_CONTENT);
          setKey((k) => k + 1);
        },
      },
    );
  }, [content, createComment]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">
        Comments {data ? `(${comments.length})` : ''}
      </h3>

      <AsyncContent loading={isLoading} className="py-6">
        <div className="space-y-4">
          {comments?.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No comments yet. Be the first!</p>
          )}
          {comments?.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <UserAvatar
                user={comment.author}
                size="sm"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{comment.author.name}</span>
                  <RelativeTime date={comment.createdAt} />
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <TiptapEditor content={comment.body} editable={false} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </AsyncContent>

      <div className="space-y-2">
        <TiptapEditor
          key={key}
          content={EMPTY_CONTENT}
          onChange={setContent}
          onSubmit={handleSubmit}
          placeholder="Add a comment... (Cmd+Enter to submit)"
          minimal
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isEditorEmpty(content) || createComment.isPending}
          >
            {createComment.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
