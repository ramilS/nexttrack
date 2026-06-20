import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type { TiptapDoc } from '@repo/shared/schemas';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';

/**
 * Raw comment view returned by the repository. Service layer decorates
 * it with auth-derived flags (`canEdit`, `canDelete`) to produce the
 * public `Comment` shape.
 */
export interface RawComment {
  id: string;
  issueId: string;
  parentId: string | null;
  authorId: string;
  author: { id: string; name: string; email: string; avatarUrl: string | null };
  body: TiptapDoc | null;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RawCommentWithReplies extends RawComment {
  replies: RawComment[];
}

export interface CursorPage<T> {
  items: T[];
  meta: { nextCursor: string | null; hasNextPage: boolean; pageSize: number };
}

const AUTHOR_SELECT = {
  select: { id: true, name: true, email: true, avatarUrl: true },
} as const;

const COMMENT_INCLUDE = {
  author: AUTHOR_SELECT,
  replies: {
    where: { deletedAt: null },
    include: { author: AUTHOR_SELECT },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type CommentAuthorRow = {
  id: string;
  issueId: string;
  parentId: string | null;
  authorId: string;
  author: { id: string; name: string; email: string; avatarUrl: string | null };
  body: unknown;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRaw(row: CommentAuthorRow): RawComment {
  const isDeleted = row.deletedAt != null;
  return {
    id: row.id,
    issueId: row.issueId,
    parentId: row.parentId,
    authorId: row.authorId,
    author: row.author,
    body: isDeleted ? null : ((row.body as TiptapDoc | null) ?? null),
    isDeleted,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRawWithReplies(row: CommentAuthorRow & { replies: CommentAuthorRow[] }): RawCommentWithReplies {
  return { ...toRaw(row), replies: row.replies.map(toRaw) };
}

@Injectable()
export class CommentsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findTopLevelByIssue(
    issueId: string,
    options: { cursor?: string; pageSize?: number; order?: 'asc' | 'desc' } = {},
  ): Promise<CursorPage<RawCommentWithReplies>> {
    const { cursor, pageSize = 50, order = 'asc' } = options;
    const cursorArgs = buildSimpleCursorArgs({ cursor, pageSize });

    const rows = await this.prisma.comment.findMany({
      where: {
        issueId,
        parentId: null,
        OR: [
          { deletedAt: null },
          { replies: { some: { deletedAt: null } } },
        ],
      },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: order },
      ...cursorArgs,
    });

    const { items, meta } = buildSimpleCursorResult(rows, pageSize);
    return { items: items.map(toRawWithReplies), meta };
  }

  async findById(commentId: string): Promise<RawComment | null> {
    const row = await this.prisma.comment.findFirst({
      where: { id: commentId },
      include: { author: AUTHOR_SELECT },
    });
    return row ? toRaw(row) : null;
  }

  async findActiveById(commentId: string): Promise<RawComment | null> {
    const row = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      include: { author: AUTHOR_SELECT },
    });
    return row ? toRaw(row) : null;
  }

  /** Returns true if the parent comment exists for the given issue and is itself a top-level (non-reply) comment. */
  async isValidReplyParent(parentId: string, issueId: string): Promise<{ exists: boolean; isTopLevel: boolean }> {
    const parent = await this.prisma.comment.findFirst({
      where: { id: parentId, issueId, deletedAt: null },
      select: { parentId: true },
    });
    if (!parent) return { exists: false, isTopLevel: false };
    return { exists: true, isTopLevel: parent.parentId === null };
  }

  async create(
    input: { issueId: string; authorId: string; parentId: string | null; body: TiptapDoc },
    tx?: Tx,
  ): Promise<RawComment> {
    const row = await this.db(tx).comment.create({
      data: {
        issueId: input.issueId,
        authorId: input.authorId,
        parentId: input.parentId,
        body: asJson(input.body),
      },
      include: { author: AUTHOR_SELECT },
    });
    return toRaw(row);
  }

  async updateBody(
    commentId: string,
    body: TiptapDoc,
    tx?: Tx,
  ): Promise<RawComment> {
    const row = await this.db(tx).comment.update({
      where: { id: commentId },
      data: { body: asJson(body), editedAt: new Date() },
      include: { author: AUTHOR_SELECT },
    });
    return toRaw(row);
  }

  async softDelete(commentId: string, deletedById: string, tx?: Tx): Promise<void> {
    const emptyBody: TiptapDoc = { type: 'doc', content: [] };
    await this.db(tx).comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedById,
        body: asJson(emptyBody),
      },
    });
  }
}
