import type { TiptapDoc } from '@repo/shared/schemas';

export class CommentCreatedEvent {
  constructor(
    public readonly commentId: string,
    public readonly issueId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly body: TiptapDoc,
    public readonly issueTitle: string,
    public readonly authorName: string | null | undefined,
    public readonly projectKey: string,
    public readonly number: number,
  ) {}
}

export class CommentUpdatedEvent {
  constructor(
    public readonly commentId: string,
    public readonly issueId: string,
    public readonly userId: string,
    public readonly oldBody: TiptapDoc | null,
    public readonly newBody: TiptapDoc,
  ) {}
}

export class CommentDeletedEvent {
  constructor(
    public readonly commentId: string,
    public readonly issueId: string,
    public readonly userId: string,
  ) {}
}
