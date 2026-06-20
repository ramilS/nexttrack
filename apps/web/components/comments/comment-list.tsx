'use client';

import { AsyncContent } from '@/components/shared/async-content';
import { CommentItem } from './comment-item';
import { CommentForm } from './comment-form';
import { useComments } from '@/lib/hooks/use-comments';
import { cn } from '@/lib/utils';

interface CommentListProps {
  issueId: string;
  projectKey: string;
  className?: string;
}

export function CommentList({ issueId, projectKey, className }: CommentListProps) {
  const { data: comments, isLoading } = useComments(issueId);

  return (
    <div className={cn('space-y-4', className)}>
      <AsyncContent loading={isLoading} className="py-6">
        {comments?.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No comments yet. Be the first!</p>
        )}
        {comments?.map((comment) => (
          <CommentItem key={comment.id} comment={comment} issueId={issueId} projectKey={projectKey} />
        ))}
      </AsyncContent>

      <CommentForm issueId={issueId} projectKey={projectKey} />
    </div>
  );
}
