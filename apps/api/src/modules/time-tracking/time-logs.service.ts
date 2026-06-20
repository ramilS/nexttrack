import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ActivityType, GlobalRole, TimeLogSource } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import {
  CreateTimeLogInput,
  UpdateTimeLogInput,
  TIME_LOG_DURATION_MAX_MINUTES,
} from '@repo/shared/schemas';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { TimeLogsRepository, TimeLog, TimeLogPatch } from './time-logs.repository';
import { parsePeriodString, formatPeriod } from '@/modules/custom-fields/period-parser';
import type { CursorMeta } from '@repo/shared';

@Injectable()
export class TimeLogsService {
  constructor(
    private timeLogsRepo: TimeLogsRepository,
    private issuesRepo: IssuesRepository,
    private activitiesService: ActivitiesService,
  ) {}

  async findAll(
    issueId: string,
    options?: { cursor?: string; pageSize?: number; userId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<{ items: TimeLog[]; meta: CursorMeta }> {
    return this.timeLogsRepo.findPage(issueId, {
      cursor: options?.cursor,
      pageSize: options?.pageSize ?? 25,
      userId: options?.userId,
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo,
    });
  }

  async create(issueId: string, userId: string, dto: CreateTimeLogInput): Promise<TimeLog> {
    const ctx = await this.issuesRepo.findCreateContext(issueId);
    if (!ctx) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    if (ctx.projectArchivedAt) {
      throw new PermissionDeniedError(ErrorCode.PROJECT_ARCHIVED);
    }

    const duration = this.parseDuration(dto.duration);
    const date = this.parseDate(dto.date);

    const log = await this.timeLogsRepo.create({
      issueId,
      userId,
      duration,
      date,
      description: dto.description ?? null,
      source: TimeLogSource.MANUAL,
    });

    await this.recalculateSpent(issueId);

    await this.activitiesService.recordOne(issueId, userId, ActivityType.TIME_LOG_ADD, {
      duration,
      durationFormatted: formatPeriod(duration),
      date: date.toISOString(),
      description: dto.description ?? null,
    });

    return log;
  }

  async update(
    issueId: string,
    logId: string,
    userId: string,
    dto: UpdateTimeLogInput,
    userRole?: string,
  ): Promise<TimeLog> {
    const log = await this.timeLogsRepo.findOwnership(issueId, logId);
    if (!log) {
      throw new NotFoundError(ErrorCode.TIME_LOG_NOT_FOUND);
    }
    if (log.userId !== userId && userRole !== GlobalRole.ADMIN) {
      throw new PermissionDeniedError(ErrorCode.FORBIDDEN);
    }

    const patch: TimeLogPatch = {};
    if (dto.duration !== undefined) patch.duration = this.parseDuration(dto.duration);
    if (dto.date !== undefined) patch.date = this.parseDate(dto.date);
    if (dto.description !== undefined) patch.description = dto.description ?? null;

    const updated = await this.timeLogsRepo.update(logId, patch);

    await this.recalculateSpent(issueId);

    await this.activitiesService.recordOne(issueId, userId, ActivityType.TIME_LOG_EDIT, {
      logId,
      fromDuration: log.duration,
      toDuration: updated.duration,
      fromFormatted: formatPeriod(log.duration),
      toFormatted: formatPeriod(updated.duration),
    });

    return updated;
  }

  async softDelete(
    issueId: string,
    logId: string,
    userId: string,
    userRole?: string,
  ): Promise<void> {
    const log = await this.timeLogsRepo.findOwnership(issueId, logId);
    if (!log) {
      throw new NotFoundError(ErrorCode.TIME_LOG_NOT_FOUND);
    }
    if (log.userId !== userId && userRole !== GlobalRole.ADMIN) {
      throw new PermissionDeniedError(ErrorCode.FORBIDDEN);
    }

    await this.timeLogsRepo.softDelete(logId, userId);
    await this.recalculateSpent(issueId);

    await this.activitiesService.recordOne(issueId, userId, ActivityType.TIME_LOG_DELETE, {
      logId,
      duration: log.duration,
      durationFormatted: formatPeriod(log.duration),
    });
  }

  async createFromTimer(
    issueId: string,
    userId: string,
    duration: number,
    description?: string | null,
  ): Promise<TimeLog> {
    const finalDuration = Math.max(1, duration);
    const date = new Date();

    const log = await this.timeLogsRepo.create({
      issueId,
      userId,
      duration: finalDuration,
      date,
      description: description ?? null,
      source: TimeLogSource.TIMER,
    });

    await this.recalculateSpent(issueId);

    await this.activitiesService.recordOne(issueId, userId, ActivityType.TIME_LOG_ADD, {
      duration: finalDuration,
      durationFormatted: formatPeriod(finalDuration),
      date: date.toISOString(),
      description: description ?? null,
      source: TimeLogSource.TIMER,
    });

    return log;
  }

  // ─── Helpers ────────────────────────────────────────────────

  parseDuration(input: number | string): number {
    let minutes: number;

    if (typeof input === 'number') {
      if (input < 1) {
        throw new ValidationError(
          ErrorCode.DURATION_TOO_SHORT,
          'Duration must be at least 1 minute',
        );
      }
      minutes = Math.round(input);
    } else {
      const parsed = parsePeriodString(input);
      if (parsed === null || parsed < 1) {
        throw new ValidationError(
          ErrorCode.DURATION_INVALID,
          `Invalid duration format: "${input}". Use format like "2h 30m"`,
        );
      }
      minutes = parsed;
    }

    if (minutes > TIME_LOG_DURATION_MAX_MINUTES) {
      throw new ValidationError(
        ErrorCode.DURATION_TOO_LONG,
        `Duration must not exceed ${TIME_LOG_DURATION_MAX_MINUTES} minutes`,
      );
    }

    return minutes;
  }

  private parseDate(dateStr?: string): Date {
    if (!dateStr) return new Date();

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new ValidationError(ErrorCode.TIME_LOG_INVALID_DATE);
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    if (date >= tomorrow) {
      throw new ValidationError(
        ErrorCode.TIME_LOG_FUTURE_DATE,
        'Cannot log time for a future date',
      );
    }

    return date;
  }

  private async recalculateSpent(issueId: string): Promise<void> {
    const total = await this.timeLogsRepo.sumDurationForIssue(issueId);
    await this.issuesRepo.updateSpent(issueId, total);
  }
}
