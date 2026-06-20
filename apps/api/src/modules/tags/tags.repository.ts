import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';
import type { Tag } from '@repo/shared/schemas';

export interface TagInput {
  projectId: string;
  name: string;
  color: string;
}

export interface TagPatch {
  name?: string;
  color?: string;
}

function toTag(row: {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: Date;
}): Tag {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Data access for `Tag` and `IssueTag` (the join table). Repositories own
 * the Prisma client interaction; services consume only domain types.
 *
 * Every write method accepts an optional `tx` so callers can compose
 * multi-step operations atomically via `TransactionService.run`.
 */
@Injectable()
export class TagsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  async findAllByProject(projectId: string): Promise<Tag[]> {
    const rows = await this.prisma.tag.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toTag);
  }

  async findById(id: string, projectId?: string): Promise<Tag | null> {
    const row = await this.prisma.tag.findFirst({
      where: { id, ...(projectId ? { projectId } : {}) },
    });
    return row ? toTag(row) : null;
  }

  /** Tags whose name matches `partial` (case-insensitive contains), capped at `limit`. */
  async findByNameContains(
    projectId: string,
    partial: string,
    limit: number,
  ): Promise<Tag[]> {
    const rows = await this.prisma.tag.findMany({
      where: { projectId, name: { contains: partial, mode: 'insensitive' } },
      take: limit,
    });
    return rows.map(toTag);
  }

  async findByNameInsensitive(projectId: string, name: string, excludeId?: string): Promise<Tag | null> {
    const row = await this.prisma.tag.findFirst({
      where: {
        projectId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return row ? toTag(row) : null;
  }

  async create(input: TagInput, tx?: Tx): Promise<Tag> {
    const row = await this.db(tx).tag.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        color: input.color,
      },
    });
    return toTag(row);
  }

  async update(id: string, patch: TagPatch, tx?: Tx): Promise<Tag> {
    const row = await this.db(tx).tag.update({
      where: { id },
      data: patch,
    });
    return toTag(row);
  }

  async delete(id: string, tx?: Tx): Promise<void> {
    await this.db(tx).tag.delete({ where: { id } });
  }

  // ─── Issue ↔ Tag link ───────────────────────────────────────

  /**
   * Counts the subset of `tagIds` that actually belong to `projectId`.
   * Used to validate that every tag passed by the client is from this
   * project before linking it to an issue.
   */
  async countInProject(projectId: string, tagIds: string[]): Promise<number> {
    if (tagIds.length === 0) return 0;
    return this.prisma.tag.count({
      where: { id: { in: tagIds }, projectId },
    });
  }

  /** Replaces all issue↔tag links for an issue. Caller passes a tx. */
  async replaceIssueLinks(issueId: string, tagIds: string[], tx?: Tx): Promise<void> {
    await this.db(tx).issueTag.deleteMany({ where: { issueId } });
    if (tagIds.length > 0) {
      await this.db(tx).issueTag.createMany({
        data: tagIds.map((tagId) => ({ issueId, tagId })),
      });
    }
  }

  /**
   * Bulk replaces tag links for many issues at once. For each issue id in
   * `issueIds`, every old link is dropped and the new set is recreated.
   */
  async replaceIssueLinksBulk(
    issueIds: string[],
    tagIds: string[],
    tx?: Tx,
  ): Promise<void> {
    if (issueIds.length === 0) return;
    await this.db(tx).issueTag.deleteMany({ where: { issueId: { in: issueIds } } });
    if (tagIds.length > 0) {
      await this.db(tx).issueTag.createMany({
        data: issueIds.flatMap((issueId) =>
          tagIds.map((tagId) => ({ issueId, tagId })),
        ),
      });
    }
  }

  async isLinkedToIssue(issueId: string, tagId: string): Promise<boolean> {
    const link = await this.prisma.issueTag.findUnique({
      where: { issueId_tagId: { issueId, tagId } },
    });
    return link !== null;
  }

  async linkToIssue(issueId: string, tagId: string, tx?: Tx): Promise<void> {
    await this.db(tx).issueTag.create({
      data: { issueId, tagId },
    });
  }

  async unlinkFromIssue(issueId: string, tagId: string, tx?: Tx): Promise<boolean> {
    const link = await this.db(tx).issueTag.findUnique({
      where: { issueId_tagId: { issueId, tagId } },
    });
    if (!link) return false;

    await this.db(tx).issueTag.delete({
      where: { issueId_tagId: { issueId, tagId } },
    });
    return true;
  }
}
