import { Injectable } from '@nestjs/common';
import type {
  TimeReportQueryInput,
  TimeReportGroup,
  TimeReportResponse,
  UserTimeReportResponse,
} from '@repo/shared/schemas';
import { formatPeriod } from '@/modules/custom-fields/period-parser';
import {
  TimeLogsRepository,
  TimeLogReportEntry,
} from './time-logs.repository';

@Injectable()
export class TimeReportsService {
  constructor(private timeLogsRepo: TimeLogsRepository) {}

  async getTimeReport(projectId: string, dto: TimeReportQueryInput): Promise<TimeReportResponse> {
    const logs = await this.fetchLogs(projectId, dto);

    const totalDuration = logs.reduce((s, l) => s + l.duration, 0);
    const groups = this.buildGroups(logs, dto.groupBy);

    return {
      period: { from: dto.dateFrom, to: dto.dateTo },
      totalDuration,
      totalDurationFormatted: formatPeriod(totalDuration),
      groups,
      summary: {
        usersCount: new Set(logs.map((l) => l.userId)).size,
        issuesCount: new Set(logs.map((l) => l.issueId)).size,
        logsCount: logs.length,
      },
    };
  }

  async getUserTimeReport(
    userId: string,
    options: { dateFrom: string; dateTo: string; projectId?: string },
  ): Promise<UserTimeReportResponse> {
    const logs = await this.timeLogsRepo.findUserReportLogs({
      userId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      projectId: options.projectId,
    });

    const totalDuration = logs.reduce((s, l) => s + l.duration, 0);

    return {
      totalDuration,
      totalDurationFormatted: formatPeriod(totalDuration),
      logs: logs.map((l) => ({
        id: l.id,
        issueId: l.issueId,
        issue: l.issue,
        duration: l.duration,
        durationFormatted: formatPeriod(l.duration),
        date: l.date,
        description: l.description,
        source: l.source,
        createdAt: l.createdAt,
      })),
    };
  }

  async exportReport(projectId: string, dto: TimeReportQueryInput, format: 'csv' | 'json') {
    const logs = await this.fetchLogs(projectId, dto);

    if (format === 'json') {
      const report = await this.getTimeReport(projectId, dto);
      return {
        contentType: 'application/json',
        content: JSON.stringify(report, null, 2),
      };
    }

    const header = 'Date,User,Email,Issue,IssueTitle,Duration,Minutes,Description';
    const rows = logs.map((l) => {
      const dateStr = l.date.toISOString().split('T')[0];
      const issueKey = `${l.issue.projectKey}-${l.issue.number}`;
      const title = this.escapeCsv(l.issue.title);
      const desc = this.escapeCsv(l.description ?? '');
      return `${dateStr},${l.user.name},${l.user.email},${issueKey},${title},${formatPeriod(l.duration)},${l.duration},${desc}`;
    });

    return {
      contentType: 'text/csv',
      content: [header, ...rows].join('\n'),
    };
  }

  // ─── Private ────────────────────────────────────────────────

  private fetchLogs(projectId: string, dto: TimeReportQueryInput): Promise<TimeLogReportEntry[]> {
    return this.timeLogsRepo.findReportLogs({
      projectId,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      userIds: dto.userIds,
      issueIds: dto.issueIds,
    });
  }

  private buildGroups(logs: TimeLogReportEntry[], groupBy: string): TimeReportGroup[] {
    switch (groupBy) {
      case 'USER':
        return this.groupBy(logs, (l) => l.userId, (l) => l.user.name);
      case 'ISSUE':
        return this.groupBy(
          logs,
          (l) => l.issueId,
          (l) => `${l.issue.projectKey}-${l.issue.number}: ${l.issue.title}`,
        );
      case 'DATE':
        return this.groupBy(
          logs,
          (l) => l.date.toISOString().split('T')[0],
          (l) => l.date.toISOString().split('T')[0],
        );
      case 'USER_ISSUE': {
        const byUser = this.groupBy(logs, (l) => l.userId, (l) => l.user.name);
        return byUser.map((userGroup) => ({
          ...userGroup,
          subGroups: this.groupBy(
            logs.filter((l) => l.userId === userGroup.key),
            (l) => l.issueId,
            (l) => `${l.issue.projectKey}-${l.issue.number}: ${l.issue.title}`,
          ),
        }));
      }
      default:
        return this.groupBy(logs, (l) => l.userId, (l) => l.user.name);
    }
  }

  private groupBy(
    logs: TimeLogReportEntry[],
    keyFn: (l: TimeLogReportEntry) => string,
    labelFn: (l: TimeLogReportEntry) => string,
  ): TimeReportGroup[] {
    const map = new Map<string, { label: string; logs: TimeLogReportEntry[] }>();

    for (const log of logs) {
      const key = keyFn(log);
      if (!map.has(key)) map.set(key, { label: labelFn(log), logs: [] });
      map.get(key)!.logs.push(log);
    }

    return Array.from(map.entries()).map(([key, { label, logs: groupLogs }]) => {
      const duration = groupLogs.reduce((s, l) => s + l.duration, 0);
      return {
        key,
        label,
        duration,
        durationFormatted: formatPeriod(duration),
      };
    });
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
