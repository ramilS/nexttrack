import { Injectable } from '@nestjs/common';
import {
  ActivityType,
  IssueType,
  Priority,
  Prisma,
  SprintStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { WorkflowStatus } from '@repo/shared/schemas';

export interface OverdueIssueRow {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  dueDate: Date;
  projectKey: string;
}

export interface RecentActivityRow {
  id: string;
  type: ActivityType;
  createdAt: Date;
  actorName: string;
  issueNumber: number;
  issueTitle: string;
  projectKey: string;
}

export interface ProjectProgressRow {
  key: string;
  name: string;
  color: string | null;
  totalIssues: number;
  workflows: { statuses: WorkflowStatus[] }[];
}

export interface TimeLogTodayRow {
  duration: number;
  issueNumber: number;
  issueTitle: string;
  projectKey: string;
}

export interface IssueListRow {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  statusId: string;
  projectKey: string;
  workflows: { statuses: WorkflowStatus[] }[];
}

export interface IssueGroupRow<TKey> {
  key: TKey;
  count: number;
}

export interface ActiveSprintRow {
  id: string;
  name: string;
  totalIssues: number;
  startDate: Date;
  endDate: Date;
}

export interface VelocitySprintRow {
  name: string;
  totalIssues: number;
  completedIssues: number;
}

/**
 * Read-model for dashboard widgets: cross-aggregate analytics over issues,
 * activities, time logs and sprints. Split from DashboardsRepository (which owns
 * the Dashboard/Widget aggregate) so own-aggregate persistence and reporting
 * reads evolve independently.
 */
@Injectable()
export class DashboardReportingRepository {
  constructor(private prisma: PrismaService) {}

  async findUserMemberProjectIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  async findWatchedIssueIds(userId: string, take: number): Promise<string[]> {
    const rows = await this.prisma.issueWatcher.findMany({
      where: { userId },
      select: { issueId: true },
      // IssueWatcher has no timestamp; order by issueId so the capped subset is
      // stable across refreshes instead of an arbitrary 20.
      orderBy: { issueId: 'desc' },
      take,
    });
    return rows.map((r) => r.issueId);
  }

  async findIssueList(
    where: Record<string, unknown>,
    take: number,
  ): Promise<IssueListRow[]> {
    const rows = await this.prisma.issue.findMany({
      where: { ...where, deletedAt: null, resolvedAt: null },
      select: {
        id: true,
        number: true,
        title: true,
        priority: true,
        statusId: true,
        project: {
          select: {
            key: true,
            workflows: {
              where: { isDefault: true },
              select: { statuses: { orderBy: { ordinal: 'asc' } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });

    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      priority: i.priority,
      statusId: i.statusId,
      projectKey: i.project.key,
      workflows: i.project.workflows,
    }));
  }

  async findOverdueIssues(
    projectIds: string[],
    now: Date,
    take: number,
  ): Promise<OverdueIssueRow[]> {
    const rows = await this.prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
        resolvedAt: null,
        dueDate: { lt: now },
      },
      select: {
        id: true,
        number: true,
        title: true,
        priority: true,
        dueDate: true,
        project: { select: { key: true } },
      },
      orderBy: { dueDate: 'asc' },
      take,
    });
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      priority: i.priority,
      dueDate: i.dueDate!,
      projectKey: i.project.key,
    }));
  }

  async findRecentActivities(
    projectIds: string[],
    take: number,
  ): Promise<RecentActivityRow[]> {
    const rows = await this.prisma.activity.findMany({
      where: {
        issue: { projectId: { in: projectIds }, deletedAt: null },
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
        actor: { select: { name: true } },
        issue: {
          select: {
            number: true,
            title: true,
            project: { select: { key: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      createdAt: a.createdAt,
      actorName: a.actor.name,
      issueNumber: a.issue.number,
      issueTitle: a.issue.title,
      projectKey: a.issue.project.key,
    }));
  }

  async findProjectsForProgress(
    projectIds: string[],
  ): Promise<ProjectProgressRow[]> {
    const rows = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, deletedAt: null, archivedAt: null },
      select: {
        key: true,
        name: true,
        color: true,
        workflows: {
          where: { isDefault: true },
          select: { statuses: { orderBy: { ordinal: 'asc' } } },
          take: 1,
        },
        _count: { select: { issues: { where: { deletedAt: null } } } },
      },
    });
    return rows.map((p) => ({
      key: p.key,
      name: p.name,
      color: p.color,
      totalIssues: p._count.issues,
      workflows: p.workflows,
    }));
  }

  /**
   * Counts resolved issues across many projects in a single query.
   * Resolved status ids are workflow-scoped UUIDs (globally unique), so grouping
   * by `statusId` is sufficient to attribute counts back to each project.
   * Returns a Map keyed by `statusId`.
   */
  async countResolvedIssuesByStatus(
    projectKeys: string[],
    resolvedStatusIds: string[],
  ): Promise<Map<string, number>> {
    if (projectKeys.length === 0 || resolvedStatusIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.issue.groupBy({
      by: ['statusId'],
      where: {
        project: { key: { in: projectKeys } },
        deletedAt: null,
        statusId: { in: resolvedStatusIds },
      },
      _count: true,
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.statusId) map.set(row.statusId, row._count);
    }
    return map;
  }

  async findTimeLogsForUserBetween(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<TimeLogTodayRow[]> {
    const rows = await this.prisma.timeLog.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: start, lte: end },
      },
      select: {
        duration: true,
        issue: {
          select: {
            number: true,
            title: true,
            project: { select: { key: true } },
          },
        },
      },
    });
    return rows.map((tl) => ({
      duration: tl.duration,
      issueNumber: tl.issue.number,
      issueTitle: tl.issue.title,
      projectKey: tl.issue.project.key,
    }));
  }

  async groupIssuesByStatus(
    projectIds: string[],
  ): Promise<IssueGroupRow<string>[]> {
    const rows = await this.prisma.issue.groupBy({
      by: ['statusId'],
      where: { projectId: { in: projectIds }, deletedAt: null },
      _count: { id: true },
    });
    return rows.map((r) => ({ key: r.statusId, count: r._count.id }));
  }

  async groupIssuesByPriority(
    projectIds: string[],
  ): Promise<IssueGroupRow<Priority>[]> {
    const rows = await this.prisma.issue.groupBy({
      by: ['priority'],
      where: { projectId: { in: projectIds }, deletedAt: null },
      _count: { id: true },
    });
    return rows.map((r) => ({ key: r.priority, count: r._count.id }));
  }

  async groupIssuesByType(
    projectIds: string[],
  ): Promise<IssueGroupRow<IssueType>[]> {
    const rows = await this.prisma.issue.groupBy({
      by: ['type'],
      where: { projectId: { in: projectIds }, deletedAt: null },
      _count: { id: true },
    });
    return rows.map((r) => ({ key: r.type, count: r._count.id }));
  }

  async findActiveSprintForProjects(
    projectIds: string[],
  ): Promise<ActiveSprintRow | null> {
    const row = await this.prisma.sprint.findFirst({
      where: {
        status: SprintStatus.ACTIVE,
        board: { projectId: { in: projectIds } },
        startDate: { not: null },
        endDate: { not: null },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!row || !row.startDate || !row.endDate) return null;
    return {
      id: row.id,
      name: row.name,
      totalIssues: row.totalIssues,
      startDate: row.startDate,
      endDate: row.endDate,
    };
  }

  async findResolvedByDayForSprint(
    sprintId: string,
    effectiveEnd: Date,
  ): Promise<{ day: Date; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ day: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT date_trunc('day', resolved_at) AS day, COUNT(*)::bigint AS cnt
        FROM issues
        WHERE sprint_id = ${sprintId}
          AND deleted_at IS NULL
          AND resolved_at IS NOT NULL
          AND resolved_at <= ${effectiveEnd}
        GROUP BY day
        ORDER BY day
      `,
    );
    return rows.map((r) => ({ day: r.day, count: Number(r.cnt) }));
  }

  async findCfdDailyCounts(
    projectIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<{ day: Date; statusId: string; count: number }[]> {
    // Cumulative count per (day, current status): issues created on/before each
    // day, grouped by their current status. The issues table is scanned ONCE
    // (the `created` CTE) and aggregated by creation day; the running total is
    // then formed by joining that small per-day aggregate against the day grid
    // (`created_day <= day`). This replaces a CROSS JOIN LATERAL that re-scanned
    // every issue once per day in the range.
    const rows = await this.prisma.$queryRaw<
      { day: Date; status_id: string; cnt: bigint }[]
    >(Prisma.sql`
      WITH created AS (
        SELECT created_at::date AS created_day, status_id, COUNT(*)::bigint AS cnt
        FROM issues
        WHERE project_id = ANY(${projectIds})
          AND deleted_at IS NULL
          AND created_at::date <= ${endDate}::date
        GROUP BY created_day, status_id
      ),
      days AS (
        SELECT generate_series(
          ${startDate}::date,
          ${endDate}::date,
          '1 day'::interval
        )::date AS day
      ),
      grid AS (
        SELECT d.day, s.status_id
        FROM days d
        CROSS JOIN (SELECT DISTINCT status_id FROM created) s
      )
      SELECT g.day, g.status_id, COALESCE(SUM(c.cnt), 0)::bigint AS cnt
      FROM grid g
      LEFT JOIN created c
        ON c.status_id = g.status_id AND c.created_day <= g.day
      GROUP BY g.day, g.status_id
      ORDER BY g.day, g.status_id
    `);
    return rows.map((r) => ({
      day: r.day,
      statusId: r.status_id,
      count: Number(r.cnt),
    }));
  }

  async findWorkflowStatusBlobs(
    projectIds: string[],
  ): Promise<{ statuses: WorkflowStatus[] }[]> {
    return this.prisma.workflow.findMany({
      where: { projectId: { in: projectIds }, isDefault: true },
      select: { statuses: { orderBy: { ordinal: 'asc' } } },
    });
  }

  async findClosedSprintsForProjects(
    projectIds: string[],
    take: number,
  ): Promise<VelocitySprintRow[]> {
    return this.prisma.sprint.findMany({
      where: {
        status: SprintStatus.CLOSED,
        board: { projectId: { in: projectIds } },
      },
      orderBy: { closedAt: 'desc' },
      take,
      select: { name: true, totalIssues: true, completedIssues: true },
    });
  }
}
