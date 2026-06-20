import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { WidgetType } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type {
  WidgetIssueRow,
  IssueListWidgetData,
  OverdueIssuesWidgetData,
  RecentActivityWidgetData,
  ProjectProgressWidgetData,
  TimeSpentTodayWidgetData,
  IssuesByStatusWidgetData,
  LabelCountWidgetData,
  SprintBurndownWidgetData,
  CfdMiniWidgetData,
  VelocityMiniWidgetData,
  WorkflowStatus,
} from '@repo/shared/schemas';
import { DashboardsRepository } from './dashboards.repository';

interface WidgetContext {
  userId: string;
  widgetType: WidgetType;
  config: Record<string, unknown>;
}

@Injectable()
export class WidgetDataService {
  private readonly logger = new Logger(WidgetDataService.name);

  constructor(private repo: DashboardsRepository) {}

  async getWidgetData(userId: string, widgetId: string): Promise<unknown> {
    const widget = await this.repo.findWidgetWithDashboardOwner(widgetId);

    if (!widget || widget.ownerUserId !== userId) {
      throw new NotFoundError(ErrorCode.DASHBOARD_WIDGET_NOT_FOUND, 'Widget not found');
    }

    const ctx: WidgetContext = {
      userId,
      widgetType: widget.type,
      config: (widget.config ?? {}) as Record<string, unknown>,
    };

    return this.dispatch(ctx);
  }

  async getAllWidgetData(
    userId: string,
    dashboardId: string,
  ): Promise<Record<string, unknown>> {
    const dashboard = await this.repo.findWithWidgets(dashboardId);

    if (!dashboard || dashboard.userId !== userId) {
      throw new NotFoundError(ErrorCode.DASHBOARD_NOT_FOUND, 'Dashboard not found');
    }

    const entries = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        const ctx: WidgetContext = {
          userId,
          widgetType: widget.type,
          config: (widget.config ?? {}) as Record<string, unknown>,
        };
        try {
          const data = await this.dispatch(ctx);
          return [widget.id, data] as const;
        } catch (err) {
          this.logger.warn(
            `Failed to fetch data for widget ${widget.id}: ${(err as Error).message}`,
          );
          return [widget.id, null] as const;
        }
      }),
    );

    return Object.fromEntries(entries);
  }

  private dispatch(ctx: WidgetContext): Promise<unknown> {
    switch (ctx.widgetType) {
      case WidgetType.MY_ISSUES:
        return this.getMyIssues(ctx);
      case WidgetType.ASSIGNED_TO_ME:
        return this.getAssignedToMe(ctx);
      case WidgetType.RECENT_ACTIVITY:
        return this.getRecentActivity(ctx);
      case WidgetType.PROJECT_PROGRESS:
        return this.getProjectProgress(ctx);
      case WidgetType.OVERDUE_ISSUES:
        return this.getOverdueIssues(ctx);
      case WidgetType.WATCHED_ISSUES:
        return this.getWatchedIssues(ctx);
      case WidgetType.TIME_SPENT_TODAY:
        return this.getTimeSpentToday(ctx);
      case WidgetType.ISSUES_BY_STATUS:
        return this.getIssuesByStatus(ctx);
      case WidgetType.ISSUES_BY_PRIORITY:
        return this.getIssuesByPriority(ctx);
      case WidgetType.ISSUES_BY_TYPE:
        return this.getIssuesByType(ctx);
      case WidgetType.SPRINT_BURNDOWN:
        return this.getSprintBurndown(ctx);
      case WidgetType.CFD_MINI:
        return this.getCfdMini(ctx);
      case WidgetType.VELOCITY_MINI:
        return this.getVelocityMini(ctx);
      case WidgetType.CUSTOM_FILTER:
        return this.getCustomFilter(ctx);
    }
  }

  private async getMyIssues(ctx: WidgetContext): Promise<IssueListWidgetData> {
    const issues = await this.findUserIssues({
      OR: [{ reporterId: ctx.userId }, { assigneeId: ctx.userId }],
    });
    return { items: issues };
  }

  private async getAssignedToMe(ctx: WidgetContext): Promise<IssueListWidgetData> {
    const issues = await this.findUserIssues({ assigneeId: ctx.userId });
    return { items: issues };
  }

  private async getWatchedIssues(ctx: WidgetContext): Promise<IssueListWidgetData> {
    const issueIds = await this.repo.findWatchedIssueIds(ctx.userId, 20);
    if (issueIds.length === 0) return { items: [] };
    const issues = await this.findUserIssues({ id: { in: issueIds } });
    return { items: issues };
  }

  private async getOverdueIssues(ctx: WidgetContext): Promise<OverdueIssuesWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const rows = await this.repo.findOverdueIssues(projectIds, new Date(), 20);
    return {
      items: rows.map((r) => ({
        id: r.id,
        projectKey: r.projectKey,
        number: r.number,
        title: r.title,
        priority: r.priority,
        dueDate: r.dueDate.toISOString(),
      })),
    };
  }

  private async getRecentActivity(ctx: WidgetContext): Promise<RecentActivityWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const rows = await this.repo.findRecentActivities(projectIds, 15);
    return {
      items: rows.map((a) => ({
        id: a.id,
        type: a.type,
        actor: a.actorName,
        summary: this.formatActivitySummary(a),
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  private async getProjectProgress(ctx: WidgetContext): Promise<ProjectProgressWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const projects = await this.repo.findProjectsForProgress(projectIds);

    const resolvedStatusesByProject = new Map<string, string[]>();
    const allResolvedStatusIds: string[] = [];
    for (const p of projects) {
      const ids = this.getResolvedStatusIds(p.workflows);
      resolvedStatusesByProject.set(p.key, ids);
      allResolvedStatusIds.push(...ids);
    }

    const countByStatus = await this.repo.countResolvedIssuesByStatus(
      projects.map((p) => p.key),
      allResolvedStatusIds,
    );

    const items = projects.map((p) => {
      const resolvedStatuses = resolvedStatusesByProject.get(p.key) ?? [];
      const doneCount = resolvedStatuses.reduce(
        (sum, statusId) => sum + (countByStatus.get(statusId) ?? 0),
        0,
      );

      const openIssueCount = p.totalIssues - doneCount;
      const progress = p.totalIssues > 0 ? doneCount / p.totalIssues : 0;

      return {
        key: p.key,
        name: p.name,
        color: p.color ?? '#6b7280',
        openIssueCount,
        totalIssueCount: p.totalIssues,
        progress,
      };
    });

    return { items };
  }

  private async getTimeSpentToday(ctx: WidgetContext): Promise<TimeSpentTodayWidgetData> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const timeLogs = await this.repo.findTimeLogsForUserBetween(
      ctx.userId,
      todayStart,
      todayEnd,
    );

    const totalMinutes = timeLogs.reduce((sum, tl) => sum + tl.duration, 0);

    const byIssue = new Map<
      string,
      { issueKey: string; title: string; minutes: number }
    >();
    for (const tl of timeLogs) {
      const issueKey = `${tl.projectKey}-${tl.issueNumber}`;
      const existing = byIssue.get(issueKey);
      if (existing) {
        existing.minutes += tl.duration;
      } else {
        byIssue.set(issueKey, {
          issueKey,
          title: tl.issueTitle,
          minutes: tl.duration,
        });
      }
    }

    return {
      totalMinutes,
      entries: Array.from(byIssue.values()).sort((a, b) => b.minutes - a.minutes),
    };
  }

  private async getIssuesByStatus(ctx: WidgetContext): Promise<IssuesByStatusWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const statusMap = await this.buildStatusMap(projectIds);

    const groups = await this.repo.groupIssuesByStatus(projectIds);

    const merged = new Map<
      string,
      { name: string; color: string; count: number }
    >();
    for (const row of groups) {
      const status = statusMap.get(row.key);
      const name = status?.name ?? 'Unknown';
      const existing = merged.get(name);
      if (existing) {
        existing.count += row.count;
      } else {
        merged.set(name, {
          name,
          color: status?.color ?? '#6b7280',
          count: row.count,
        });
      }
    }

    return {
      items: Array.from(merged.values()).sort((a, b) => b.count - a.count),
    };
  }

  private async getIssuesByPriority(ctx: WidgetContext): Promise<LabelCountWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const groups = await this.repo.groupIssuesByPriority(projectIds);
    return {
      items: groups.map((r) => ({ name: r.key, count: r.count })),
    };
  }

  private async getIssuesByType(ctx: WidgetContext): Promise<LabelCountWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const groups = await this.repo.groupIssuesByType(projectIds);
    return {
      items: groups.map((r) => ({ name: r.key, count: r.count })),
    };
  }

  private async getSprintBurndown(ctx: WidgetContext): Promise<SprintBurndownWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const activeSprint = await this.repo.findActiveSprintForProjects(projectIds);
    if (!activeSprint) return { points: [], sprintName: null };

    const { startDate: start, endDate: end, totalIssues } = activeSprint;
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const resolvedByDay = await this.repo.findResolvedByDayForSprint(
      activeSprint.id,
      effectiveEnd,
    );

    const cumulativeByDay = new Map<string, number>();
    let cumulative = 0;
    for (const row of resolvedByDay) {
      cumulative += row.count;
      cumulativeByDay.set(row.day.toISOString().slice(0, 10), cumulative);
    }

    const points: { date: string; ideal: number; actual: number }[] = [];
    let runningResolved = 0;
    for (let day = 0; day <= totalDays; day++) {
      const date = new Date(start);
      date.setDate(date.getDate() + day);
      if (date > now) break;

      const dayKey = date.toISOString().slice(0, 10);
      runningResolved = cumulativeByDay.get(dayKey) ?? runningResolved;

      points.push({
        date: date.toISOString(),
        ideal: Math.round(totalIssues * (1 - day / totalDays)),
        actual: totalIssues - runningResolved,
      });
    }

    return { points, sprintName: activeSprint.name };
  }

  private async getCfdMini(ctx: WidgetContext): Promise<CfdMiniWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    if (projectIds.length === 0) return { dates: [], series: [] };

    const statusMap = await this.buildStatusMap(projectIds);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    const rows = await this.repo.findCfdDailyCounts(
      projectIds,
      startDate,
      endDate,
    );

    const dayStatusCount = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const dayKey = row.day.toISOString().slice(0, 10);
      let statusCounts = dayStatusCount.get(dayKey);
      if (!statusCounts) {
        statusCounts = new Map();
        dayStatusCount.set(dayKey, statusCounts);
      }
      statusCounts.set(row.statusId, row.count);
    }

    const dates: string[] = [];
    const uniqueStatuses = this.deduplicateStatuses(statusMap);
    const series: { statusName: string; color: string; counts: number[] }[] =
      uniqueStatuses.map((s) => ({
        statusName: s.name,
        color: s.color,
        counts: [],
      }));

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayKey = d.toISOString().slice(0, 10);
      dates.push(new Date(d).toISOString());
      const statusCounts = dayStatusCount.get(dayKey);

      for (const s of series) {
        const matchingIds = Array.from(statusMap.entries())
          .filter(([, ws]) => ws.name === s.statusName)
          .map(([id]) => id);
        const total = matchingIds.reduce(
          (sum, id) => sum + (statusCounts?.get(id) ?? 0),
          0,
        );
        s.counts.push(total);
      }
    }

    return {
      dates,
      series: series.filter((s) => s.counts.some((c) => c > 0)),
    };
  }

  private async getVelocityMini(ctx: WidgetContext): Promise<VelocityMiniWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const closedSprints = await this.repo.findClosedSprintsForProjects(
      projectIds,
      6,
    );

    if (closedSprints.length === 0) {
      return { sprints: [], averageVelocity: 0 };
    }

    const sprints = closedSprints.reverse().map((s) => ({
      name: s.name,
      planned: s.totalIssues,
      completed: s.completedIssues,
    }));

    const averageVelocity = Math.round(
      sprints.reduce((sum, s) => sum + s.completed, 0) / sprints.length,
    );

    return { sprints, averageVelocity };
  }

  private async getCustomFilter(ctx: WidgetContext): Promise<IssueListWidgetData> {
    const projectIds = await this.repo.findUserMemberProjectIds(ctx.userId);
    const issues = await this.findUserIssues({ projectId: { in: projectIds } });
    return { items: issues };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private async findUserIssues(
    where: Record<string, unknown>,
  ): Promise<WidgetIssueRow[]> {
    const rows = await this.repo.findIssueList(where, 20);

    return rows.map((i) => {
      const status = this.resolveStatus(i.statusId, i.workflows);
      return {
        id: i.id,
        projectKey: i.projectKey,
        number: i.number,
        title: i.title,
        priority: i.priority,
        status: {
          id: status?.id ?? i.statusId,
          name: status?.name ?? 'Unknown',
          color: status?.color ?? '#6b7280',
          category: status?.category ?? 'UNSTARTED',
        },
      };
    });
  }

  private deduplicateStatuses(
    statusMap: Map<string, WorkflowStatus>,
  ): WorkflowStatus[] {
    const seen = new Set<string>();
    const result: WorkflowStatus[] = [];
    for (const s of statusMap.values()) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        result.push(s);
      }
    }
    return result;
  }

  private async buildStatusMap(
    projectIds: string[],
  ): Promise<Map<string, WorkflowStatus>> {
    const workflows = await this.repo.findWorkflowStatusBlobs(projectIds);
    const map = new Map<string, WorkflowStatus>();
    for (const wf of workflows) {
      for (const s of wf.statuses) {
        map.set(s.id, s);
      }
    }
    return map;
  }

  private resolveStatus(
    statusId: string,
    workflows: { statuses: WorkflowStatus[] }[],
  ): WorkflowStatus | undefined {
    for (const wf of workflows) {
      const found = wf.statuses.find((s) => s.id === statusId);
      if (found) return found;
    }
    return undefined;
  }

  private getResolvedStatusIds(workflows: { statuses: WorkflowStatus[] }[]): string[] {
    const ids: string[] = [];
    for (const wf of workflows) {
      for (const s of wf.statuses) {
        if (s.isResolved) ids.push(s.id);
      }
    }
    return ids;
  }

  private formatActivitySummary(activity: {
    type: string;
    actorName: string;
    issueNumber: number;
    issueTitle: string;
    projectKey: string;
  }): string {
    const issueKey = `${activity.projectKey}-${activity.issueNumber}`;
    const actor = activity.actorName;

    const actionMap: Record<string, string> = {
      ISSUE_CREATED: 'created',
      STATUS_CHANGE: 'changed status of',
      ASSIGNEE_CHANGE: 'reassigned',
      PRIORITY_CHANGE: 'changed priority of',
      COMMENT_ADD: 'commented on',
      ATTACHMENT_ADD: 'attached a file to',
      SPRINT_CHANGE: 'moved to sprint',
      ESTIMATE_CHANGE: 'updated estimate of',
      DUE_DATE_CHANGE: 'updated due date of',
      TAG_ADD: 'tagged',
      TAG_REMOVE: 'untagged',
      TYPE_CHANGE: 'changed type of',
      TITLE_CHANGE: 'renamed',
      DESCRIPTION_CHANGE: 'updated description of',
      COMMENT_EDIT: 'edited comment on',
      COMMENT_DELETE: 'deleted comment on',
      ATTACHMENT_DELETE: 'removed attachment from',
      PARENT_CHANGE: 'changed parent of',
      WATCHER_ADD: 'started watching',
      WATCHER_REMOVE: 'stopped watching',
    };

    const action = actionMap[activity.type] ?? 'updated';
    return `${actor} ${action} ${issueKey}`;
  }
}
