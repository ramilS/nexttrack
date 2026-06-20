import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { DomainEventPublisher } from '@/modules/outbox/domain-event-publisher';
import { TransactionService } from '@/common/repository/transaction.service';
import type {
  Comment,
  CreateCommentInput,
  UpdateCommentInput,
} from '@repo/shared/schemas';
import {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
} from './events/comment.events';
import {
  CommentsRepository,
  type RawComment,
  type RawCommentWithReplies,
} from './comments.repository';
import { IssuesReader } from '@/modules/issues/issues.reader';

function decorate(raw: RawComment, currentUserId: string, isAdmin: boolean): Comment {
  const canMutate = !raw.isDeleted && (raw.authorId === currentUserId || isAdmin);
  return {
    id: raw.id,
    issueId: raw.issueId,
    parentId: raw.parentId,
    author: raw.author,
    body: raw.body,
    isDeleted: raw.isDeleted,
    editedAt: raw.editedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    canEdit: canMutate,
    canDelete: canMutate,
    replies: [],
  };
}

function decorateWithReplies(
  raw: RawCommentWithReplies,
  currentUserId: string,
  isAdmin: boolean,
): Comment {
  return {
    ...decorate(raw, currentUserId, isAdmin),
    replies: raw.replies.map((r) => decorate(r, currentUserId, isAdmin)),
  };
}

@Injectable()
export class CommentsService {
  private readonly logger = new AppLogger(CommentsService.name);

  constructor(
    private commentsRepo: CommentsRepository,
    private issuesRepo: IssuesReader,
    private txService: TransactionService,
    private domainEvents: DomainEventPublisher,
  ) {}

  async findByIssue(
    issueId: string,
    currentUserId: string,
    options: {
      cursor?: string;
      pageSize?: number;
      order?: 'asc' | 'desc';
      isAdmin?: boolean;
    } = {},
  ) {
    const { isAdmin = false, ...page } = options;
    const result = await this.commentsRepo.findTopLevelByIssue(issueId, page);

    return {
      items: result.items.map((c) => decorateWithReplies(c, currentUserId, isAdmin)),
      meta: result.meta,
    };
  }

  async create(issueId: string, userId: string, dto: CreateCommentInput): Promise<Comment> {
    const issue = await this.issuesRepo.findIssueRef(issueId);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    if (dto.parentId) {
      const { exists, isTopLevel } = await this.commentsRepo.isValidReplyParent(
        dto.parentId,
        issueId,
      );
      if (!exists) {
        throw new ValidationError(ErrorCode.PARENT_COMMENT_NOT_FOUND);
      }
      if (!isTopLevel) {
        throw new ValidationError(
          ErrorCode.COMMENT_REPLY_TO_REPLY,
          'Cannot reply to a reply. Only top-level comments accept replies.',
        );
      }
    }

    const raw = await this.txService.run(async (tx) => {
      const created = await this.commentsRepo.create(
        {
          issueId,
          authorId: userId,
          parentId: dto.parentId ?? null,
          body: dto.body,
        },
        tx,
      );

      await this.domainEvents.publish(
        {
          eventType: 'comment.created',
          aggregateType: 'Comment',
          aggregateId: created.id,
          payload: {
            ...new CommentCreatedEvent(
              created.id,
              issueId,
              issue.projectId,
              userId,
              dto.body,
              issue.title,
              created.author.name,
              issue.projectKey,
              issue.number,
            ),
          },
        },
        tx,
      );

      return created;
    });

    this.logger.log('Comment created', {
      commentId: raw.id,
      issueId,
      projectId: issue.projectId,
      parentId: dto.parentId ?? null,
    });

    return decorate(raw, userId, false);
  }

  async update(
    commentId: string,
    userId: string,
    dto: UpdateCommentInput,
    isAdmin: boolean,
  ): Promise<Comment> {
    const existing = await this.commentsRepo.findById(commentId);
    if (!existing) {
      throw new NotFoundError(ErrorCode.COMMENT_NOT_FOUND);
    }

    if (existing.isDeleted) {
      throw new ValidationError(ErrorCode.COMMENT_DELETED);
    }

    if (existing.authorId !== userId && !isAdmin) {
      throw new PermissionDeniedError(ErrorCode.COMMENT_NOT_AUTHOR);
    }

    const updated = await this.txService.run(async (tx) => {
      const row = await this.commentsRepo.updateBody(commentId, dto.body, tx);

      await this.domainEvents.publish(
        {
          eventType: 'comment.updated',
          aggregateType: 'Comment',
          aggregateId: commentId,
          payload: {
            ...new CommentUpdatedEvent(
              commentId,
              existing.issueId,
              userId,
              existing.body,
              dto.body,
            ),
          },
        },
        tx,
      );

      return row;
    });

    this.logger.log('Comment updated', {
      commentId,
      issueId: existing.issueId,
      byAdmin: isAdmin && existing.authorId !== userId,
    });

    return decorate(updated, userId, isAdmin);
  }

  async softDelete(commentId: string, userId: string, isAdmin: boolean): Promise<void> {
    const existing = await this.commentsRepo.findActiveById(commentId);
    if (!existing) {
      throw new NotFoundError(ErrorCode.COMMENT_NOT_FOUND);
    }

    if (existing.authorId !== userId && !isAdmin) {
      throw new PermissionDeniedError(ErrorCode.COMMENT_NOT_AUTHOR);
    }

    await this.txService.run(async (tx) => {
      await this.commentsRepo.softDelete(commentId, userId, tx);

      await this.domainEvents.publish(
        {
          eventType: 'comment.deleted',
          aggregateType: 'Comment',
          aggregateId: commentId,
          payload: {
            ...new CommentDeletedEvent(commentId, existing.issueId, userId),
          },
        },
        tx,
      );
    });

    this.logger.log('Comment soft-deleted', {
      commentId,
      issueId: existing.issueId,
      byAdmin: isAdmin && existing.authorId !== userId,
    });
  }
}
