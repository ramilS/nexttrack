import { Injectable } from '@nestjs/common';
import { ActivityType, Prisma, UserKind } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';
import type { CursorMeta } from '@repo/shared';

export interface StatusChangeRecord {
  issueId: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
}

export interface ActivityWriteInput {
  issueId: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
}

export interface ActivityRow {
  id: string;
  issueId: string;
  type: ActivityType;
  payload: Prisma.JsonValue;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    kind: UserKind;
  };
}

export interface FindByIssueOptions {
  cursor?: string;
  pageSize?: number;
  types?: ActivityType[];
}

/**
 * Selected on both `create` and `findByIssue` — kept as one constant so the
 * two call sites can't drift (a `kind` added to one but not the other is
 * exactly the bug this shape exists to prevent: the integration badge shows
 * up on one activity feed and silently vanishes on the other).
 */
const ACTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  kind: true,
} as const;

@Injectable()
export class ActivitiesRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns STATUS_CHANGE activity rows for a set of issues within a date
   * range, ordered oldest → newest. Used to reconstruct historical state
   * for cumulative-flow diagrams.
   */
  async findStatusChangesInRange(
    issueIds: string[],
    from: Date,
    to: Date,
  ): Promise<StatusChangeRecord[]> {
    if (issueIds.length === 0) return [];
    const rows = await this.prisma.activity.findMany({
      where: {
        issueId: { in: issueIds },
        type: ActivityType.STATUS_CHANGE,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'asc' },
      select: { issueId: true, payload: true, createdAt: true },
    });
    return rows;
  }

  async createMany(entries: ActivityWriteInput[], tx?: Tx): Promise<void> {
    if (entries.length === 0) return;
    await (tx ?? this.prisma).activity.createMany({
      data: entries.map((e) => ({
        issueId: e.issueId,
        actorId: e.actorId,
        type: e.type,
        payload: asJson(e.payload),
      })),
    });
  }

  async create(entry: ActivityWriteInput, tx?: Tx): Promise<ActivityRow> {
    return (tx ?? this.prisma).activity.create({
      data: {
        issueId: entry.issueId,
        actorId: entry.actorId,
        type: entry.type,
        payload: asJson(entry.payload),
      },
      include: {
        actor: { select: ACTOR_SELECT },
      },
    });
  }

  async findByIssue(
    issueId: string,
    options?: FindByIssueOptions,
  ): Promise<{ items: ActivityRow[]; meta: CursorMeta }> {
    const pageSize = options?.pageSize ?? 50;

    const where: Prisma.ActivityWhereInput = { issueId };
    if (options?.types?.length) {
      where.type = { in: options.types };
    }

    const cursorArgs = buildSimpleCursorArgs({
      cursor: options?.cursor,
      pageSize,
    });

    const items = await this.prisma.activity.findMany({
      where,
      include: {
        actor: { select: ACTOR_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      ...cursorArgs,
    });

    return buildSimpleCursorResult(items, pageSize);
  }
}
