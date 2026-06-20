import { Injectable } from '@nestjs/common';
import { Prisma, TimeLogSource } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Tx } from '@/common/repository/tx.types';
import {
  buildSimpleCursorArgs,
  buildSimpleCursorResult,
} from '@/common/utils/cursor-paginate';
import { formatPeriod } from '@/modules/custom-fields/period-parser';
import type { CursorMeta } from '@repo/shared';
import type { TimeLog } from '@repo/shared/schemas';

export type { TimeLog };

export interface TimeLogUserRef {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}


export interface TimeLogIssueRef {
  id: string;
  number: number;
  title: string;
  projectKey: string;
}

export interface TimeLogReportEntry {
  id: string;
  userId: string;
  issueId: string;
  duration: number;
  date: Date;
  description: string | null;
  source: TimeLogSource;
  createdAt: Date;
  user: TimeLogUserRef;
  issue: TimeLogIssueRef;
}

export interface TimeLogUserReportIssueRef extends TimeLogIssueRef {
  projectName: string;
}

export interface TimeLogUserReportEntry {
  id: string;
  issueId: string;
  duration: number;
  date: string;
  description: string | null;
  source: TimeLogSource;
  createdAt: string;
  issue: TimeLogUserReportIssueRef;
}

export interface TimeLogOwnership {
  id: string;
  issueId: string;
  userId: string;
  duration: number;
}

export interface TimeLogListOptions {
  cursor?: string;
  pageSize: number;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TimeLogCreateInput {
  issueId: string;
  userId: string;
  duration: number;
  date: Date;
  description: string | null;
  source: TimeLogSource;
}

export interface TimeLogPatch {
  duration?: number;
  date?: Date;
  description?: string | null;
}

export interface ReportFilter {
  projectId: string;
  dateFrom: string;
  dateTo: string;
  userIds?: string[];
  issueIds?: string[];
}

export interface UserReportFilter {
  userId: string;
  dateFrom: string;
  dateTo: string;
  projectId?: string;
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const;

const ISSUE_REF_SELECT = {
  id: true,
  number: true,
  title: true,
  project: { select: { key: true } },
} as const;

const ISSUE_USER_REPORT_SELECT = {
  id: true,
  number: true,
  title: true,
  project: { select: { key: true, name: true } },
} as const;

type RawListRow = {
  id: string;
  issueId: string;
  duration: number;
  date: Date;
  description: string | null;
  source: TimeLogSource;
  createdAt: Date;
  user: TimeLogUserRef;
};

function toTimeLog(row: RawListRow): TimeLog {
  return {
    id: row.id,
    issueId: row.issueId,
    userId: row.user.id,
    userName: row.user.name,
    userAvatarUrl: row.user.avatarUrl,
    duration: row.duration,
    durationFormatted: formatPeriod(row.duration),
    date: row.date.toISOString(),
    description: row.description,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TimeLogsRepository {
  constructor(private prisma: PrismaService) {}

  async findPage(
    issueId: string,
    options: TimeLogListOptions,
  ): Promise<{ items: TimeLog[]; meta: CursorMeta }> {
    const where: Prisma.TimeLogWhereInput = { issueId, deletedAt: null };
    if (options.userId) where.userId = options.userId;
    if (options.dateFrom || options.dateTo) {
      where.date = {};
      if (options.dateFrom) where.date.gte = new Date(options.dateFrom);
      if (options.dateTo) where.date.lte = new Date(options.dateTo);
    }

    const cursorArgs = buildSimpleCursorArgs({
      cursor: options.cursor,
      pageSize: options.pageSize,
    });

    const rows = await this.prisma.timeLog.findMany({
      where,
      include: { user: { select: USER_SELECT } },
      orderBy: { date: 'desc' },
      ...cursorArgs,
    });

    const { items, meta } = buildSimpleCursorResult(rows, options.pageSize);
    return { items: items.map(toTimeLog), meta };
  }

  async findOwnership(
    issueId: string,
    logId: string,
  ): Promise<TimeLogOwnership | null> {
    const row = await this.prisma.timeLog.findFirst({
      where: { id: logId, issueId, deletedAt: null },
      select: { id: true, issueId: true, userId: true, duration: true },
    });
    return row;
  }

  async create(input: TimeLogCreateInput, tx?: Tx): Promise<TimeLog> {
    const row = await (tx ?? this.prisma).timeLog.create({
      data: {
        issueId: input.issueId,
        userId: input.userId,
        duration: input.duration,
        date: input.date,
        description: input.description ?? undefined,
        source: input.source,
      },
      include: { user: { select: USER_SELECT } },
    });
    return toTimeLog(row);
  }

  async update(logId: string, patch: TimeLogPatch, tx?: Tx): Promise<TimeLog> {
    const data: Prisma.TimeLogUpdateInput = {};
    if (patch.duration !== undefined) data.duration = patch.duration;
    if (patch.date !== undefined) data.date = patch.date;
    if (patch.description !== undefined) data.description = patch.description;

    const row = await (tx ?? this.prisma).timeLog.update({
      where: { id: logId },
      data,
      include: { user: { select: USER_SELECT } },
    });
    return toTimeLog(row);
  }

  async softDelete(logId: string, deletedBy: string, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).timeLog.update({
      where: { id: logId },
      data: { deletedAt: new Date(), deletedById: deletedBy },
    });
  }

  async sumDurationForIssue(issueId: string, tx?: Tx): Promise<number> {
    const agg = await (tx ?? this.prisma).timeLog.aggregate({
      where: { issueId, deletedAt: null },
      _sum: { duration: true },
    });
    return agg._sum.duration ?? 0;
  }

  private reportWhere(filter: ReportFilter): Prisma.TimeLogWhereInput {
    const where: Prisma.TimeLogWhereInput = {
      issue: { projectId: filter.projectId },
      deletedAt: null,
      date: {
        gte: new Date(filter.dateFrom),
        lte: new Date(filter.dateTo),
      },
    };
    if (filter.userIds?.length) where.userId = { in: filter.userIds };
    if (filter.issueIds?.length) where.issueId = { in: filter.issueIds };
    return where;
  }

  countReportLogs(filter: ReportFilter): Promise<number> {
    return this.prisma.timeLog.count({ where: this.reportWhere(filter) });
  }

  async findReportLogs(filter: ReportFilter): Promise<TimeLogReportEntry[]> {
    const rows = await this.prisma.timeLog.findMany({
      where: this.reportWhere(filter),
      include: {
        user: { select: USER_SELECT },
        issue: { select: ISSUE_REF_SELECT },
      },
      orderBy: { date: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      issueId: r.issueId,
      duration: r.duration,
      date: r.date,
      description: r.description,
      source: r.source,
      createdAt: r.createdAt,
      user: r.user,
      issue: {
        id: r.issue.id,
        number: r.issue.number,
        title: r.issue.title,
        projectKey: r.issue.project.key,
      },
    }));
  }

  private userReportWhere(filter: UserReportFilter): Prisma.TimeLogWhereInput {
    const where: Prisma.TimeLogWhereInput = {
      userId: filter.userId,
      deletedAt: null,
      date: {
        gte: new Date(filter.dateFrom),
        lte: new Date(filter.dateTo),
      },
    };
    if (filter.projectId) {
      where.issue = { projectId: filter.projectId };
    }
    return where;
  }

  countUserReportLogs(filter: UserReportFilter): Promise<number> {
    return this.prisma.timeLog.count({ where: this.userReportWhere(filter) });
  }

  async findUserReportLogs(
    filter: UserReportFilter,
  ): Promise<TimeLogUserReportEntry[]> {
    const rows = await this.prisma.timeLog.findMany({
      where: this.userReportWhere(filter),
      include: { issue: { select: ISSUE_USER_REPORT_SELECT } },
      orderBy: { date: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      issueId: r.issueId,
      duration: r.duration,
      date: r.date.toISOString(),
      description: r.description,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      issue: {
        id: r.issue.id,
        number: r.issue.number,
        title: r.issue.title,
        projectKey: r.issue.project.key,
        projectName: r.issue.project.name,
      },
    }));
  }
}
