import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WidgetType,
  SprintStatus,
  Priority,
  IssueType,
  ActivityType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type { WorkflowStatus } from '@repo/shared/schemas';

export interface DashboardRow {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  layout: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidgetRow {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: Prisma.JsonValue;
}

export interface DashboardWithWidgetsRow extends DashboardRow {
  widgets: DashboardWidgetRow[];
}

export interface CreateDashboardInput {
  userId: string;
  name: string;
  isDefault: boolean;
}

export interface UpdateDashboardPatch {
  name?: string;
  layout?: unknown;
  isDefault?: boolean;
}

export interface CreateWidgetInput {
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: unknown;
}

export interface UpdateWidgetPatch {
  title?: string;
  config?: unknown;
}

export interface DefaultWidgetSeed {
  type: WidgetType;
  title: string;
}

export interface DashboardWidgetWithOwnerRow extends DashboardWidgetRow {
  ownerUserId: string;
}

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

@Injectable()
export class DashboardsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  // ─── Dashboard CRUD ─────────────────────────────────────────

  async findAllByUser(userId: string): Promise<DashboardWithWidgetsRow[]> {
    return this.prisma.dashboard.findMany({
      where: { userId },
      include: { widgets: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findWithWidgets(
    dashboardId: string,
  ): Promise<DashboardWithWidgetsRow | null> {
    return this.prisma.dashboard.findFirst({
      where: { id: dashboardId },
      include: { widgets: true },
    });
  }

  async findDefaultForUserWithWidgets(
    userId: string,
  ): Promise<DashboardWithWidgetsRow | null> {
    return this.prisma.dashboard.findFirst({
      where: { userId, isDefault: true },
      include: { widgets: true },
    });
  }

  async unsetDefaultForUser(
    userId: string,
    exceptDashboardId?: string,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).dashboard.updateMany({
      where: {
        userId,
        isDefault: true,
        ...(exceptDashboardId ? { id: { not: exceptDashboardId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async create(input: CreateDashboardInput): Promise<DashboardWithWidgetsRow> {
    return this.prisma.dashboard.create({
      data: {
        userId: input.userId,
        name: input.name,
        isDefault: input.isDefault,
        layout: asJson([]),
      },
      include: { widgets: true },
    });
  }

  async update(
    dashboardId: string,
    patch: UpdateDashboardPatch,
  ): Promise<DashboardWithWidgetsRow> {
    return this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.layout !== undefined && { layout: asJson(patch.layout) }),
        ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }),
      },
      include: { widgets: true },
    });
  }

  async delete(dashboardId: string): Promise<void> {
    await this.prisma.dashboard.delete({ where: { id: dashboardId } });
  }

  async createWithDefaultWidgets(
    userId: string,
    name: string,
    widgets: DefaultWidgetSeed[],
    buildLayout: (
      widgets: DashboardWidgetRow[],
    ) => unknown,
  ): Promise<DashboardWithWidgetsRow> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.dashboard.create({
        data: {
          userId,
          name,
          isDefault: true,
          layout: asJson([]),
          widgets: {
            create: widgets.map((w) => ({
              type: w.type,
              title: w.title,
              config: asJson({}),
            })),
          },
        },
        include: { widgets: true },
      });

      const layout = buildLayout(created.widgets);

      return tx.dashboard.update({
        where: { id: created.id },
        data: { layout: asJson(layout) },
        include: { widgets: true },
      });
    });
  }

  // ─── Widget CRUD ────────────────────────────────────────────

  async findWidgetWithDashboardOwner(
    widgetId: string,
  ): Promise<DashboardWidgetWithOwnerRow | null> {
    const row = await this.prisma.dashboardWidget.findFirst({
      where: { id: widgetId },
      include: { dashboard: { select: { userId: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      dashboardId: row.dashboardId,
      type: row.type,
      title: row.title,
      config: row.config,
      ownerUserId: row.dashboard.userId,
    };
  }

  async findWidgetInDashboard(
    dashboardId: string,
    widgetId: string,
  ): Promise<DashboardWidgetRow | null> {
    return this.prisma.dashboardWidget.findFirst({
      where: { id: widgetId, dashboardId },
    });
  }

  async createWidget(input: CreateWidgetInput): Promise<DashboardWidgetRow> {
    return this.prisma.dashboardWidget.create({
      data: {
        dashboardId: input.dashboardId,
        type: input.type,
        title: input.title,
        config: asJson(input.config),
      },
    });
  }

  async updateWidget(
    widgetId: string,
    patch: UpdateWidgetPatch,
  ): Promise<DashboardWidgetRow> {
    return this.prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.config !== undefined && { config: asJson(patch.config) }),
      },
    });
  }

  async deleteWidget(widgetId: string): Promise<void> {
    await this.prisma.dashboardWidget.delete({ where: { id: widgetId } });
  }

  // ─── Widget data: cross-aggregate reads ─────────────────────

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
    const rows = await this.prisma.$queryRaw<
      { day: Date; status_id: string; cnt: bigint }[]
    >(Prisma.sql`
      WITH days AS (
        SELECT generate_series(
          ${startDate}::date,
          ${endDate}::date,
          '1 day'::interval
        )::date AS day
      )
      SELECT d.day, i.status_id, COUNT(*)::bigint AS cnt
      FROM days d
      CROSS JOIN LATERAL (
        SELECT status_id
        FROM issues
        WHERE project_id = ANY(${projectIds})
          AND deleted_at IS NULL
          AND created_at::date <= d.day
      ) i
      GROUP BY d.day, i.status_id
      ORDER BY d.day, i.status_id
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
