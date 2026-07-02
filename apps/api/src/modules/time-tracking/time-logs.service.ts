import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
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
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';
import { IndexerHooksService } from '@/modules/search/indexer/indexer-hooks.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import type { CursorMeta } from '@repo/shared';

@Injectable()
export class TimeLogsService {
  private readonly logger = new AppLogger(TimeLogsService.name);

  constructor(
    private timeLogsRepo: TimeLogsRepository,
    private issuesRepo: IssuesRepository,
    private activitiesService: ActivitiesService,
    private txService: TransactionService,
    private indexerHooks: IndexerHooksService,
    private background: BackgroundTasks,
  ) {}

  /**
   * `spent` is part of the ES issue document (filterable/sortable), so any
   * change to logged time must re-index the issue. Drainable fire-and-forget:
   * the index is eventually consistent, the write must not block the request.
   */
  private reindexSpent(issueId: string): void {
    this.background.run(
      () => this.indexerHooks.onIssueChanged(issueId, 'time_log'),
      (err) => this.logger.error('Reindex after time-log change failed', err, { issueId }),
    );
  }

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

    const log = await this.txService.run(async (tx) => {
      const created = await this.timeLogsRepo.create(
        {
          issueId,
          userId,
          duration,
          date,
          description: dto.description ?? null,
          source: TimeLogSource.MANUAL,
        },
        tx,
      );
      await this.recalculateSpent(issueId, tx);
      await this.activitiesService.recordOne(
        issueId,
        userId,
        ActivityType.TIME_LOG_ADD,
        {
          duration,
          durationFormatted: formatPeriod(duration),
          date: date.toISOString(),
          description: dto.description ?? null,
        },
        tx,
      );
      return created;
    });

    this.logger.log('Time log created', {
      timeLogId: log.id,
      issueId,
      duration,
      source: TimeLogSource.MANUAL,
    });
    this.reindexSpent(issueId);

    return log;
  }

  // Bulk import for the migration tool: creates IMPORT-sourced logs (each with
  // its original author + date), recalculates spent once, and skips per-log
  // activity records (a migration is not a user action). No archived-project
  // block — migration must be able to import into any project state.
  async importMany(
    issueId: string,
    entries: Array<{
      userId: string;
      minutes: number;
      date: string;
      description: string | null;
    }>,
  ): Promise<number> {
    const ctx = await this.issuesRepo.findCreateContext(issueId);
    if (!ctx) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    await this.txService.run(async (tx) => {
      for (const entry of entries) {
        await this.timeLogsRepo.create(
          {
            issueId,
            userId: entry.userId,
            duration: entry.minutes,
            date: this.parseDate(entry.date),
            description: entry.description,
            source: TimeLogSource.IMPORT,
          },
          tx,
        );
      }
      await this.recalculateSpent(issueId, tx);
    });

    this.reindexSpent(issueId);
    this.logger.log('Time logs imported', { issueId, count: entries.length });
    return entries.length;
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

    const updated = await this.txService.run(async (tx) => {
      const row = await this.timeLogsRepo.update(logId, patch, tx);
      await this.recalculateSpent(issueId, tx);
      await this.activitiesService.recordOne(
        issueId,
        userId,
        ActivityType.TIME_LOG_EDIT,
        {
          logId,
          fromDuration: log.duration,
          toDuration: row.duration,
          fromFormatted: formatPeriod(log.duration),
          toFormatted: formatPeriod(row.duration),
        },
        tx,
      );
      return row;
    });

    this.logger.log('Time log updated', {
      timeLogId: logId,
      issueId,
      fields: Object.keys(patch),
      fromDuration: log.duration,
      toDuration: updated.duration,
    });
    this.reindexSpent(issueId);

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

    await this.txService.run(async (tx) => {
      await this.timeLogsRepo.softDelete(logId, userId, tx);
      await this.recalculateSpent(issueId, tx);
      await this.activitiesService.recordOne(
        issueId,
        userId,
        ActivityType.TIME_LOG_DELETE,
        {
          logId,
          duration: log.duration,
          durationFormatted: formatPeriod(log.duration),
        },
        tx,
      );
    });

    this.logger.log('Time log deleted', {
      timeLogId: logId,
      issueId,
      duration: log.duration,
    });
    this.reindexSpent(issueId);
  }

  async createFromTimer(
    issueId: string,
    userId: string,
    duration: number,
    description?: string | null,
  ): Promise<TimeLog> {
    const finalDuration = Math.max(1, duration);
    const date = new Date();

    const log = await this.txService.run(async (tx) => {
      const created = await this.timeLogsRepo.create(
        {
          issueId,
          userId,
          duration: finalDuration,
          date,
          description: description ?? null,
          source: TimeLogSource.TIMER,
        },
        tx,
      );
      await this.recalculateSpent(issueId, tx);
      await this.activitiesService.recordOne(
        issueId,
        userId,
        ActivityType.TIME_LOG_ADD,
        {
          duration: finalDuration,
          durationFormatted: formatPeriod(finalDuration),
          date: date.toISOString(),
          description: description ?? null,
          source: TimeLogSource.TIMER,
        },
        tx,
      );
      return created;
    });

    this.logger.log('Time log created from timer', {
      timeLogId: log.id,
      issueId,
      duration: finalDuration,
      source: TimeLogSource.TIMER,
    });
    this.reindexSpent(issueId);

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

  private async recalculateSpent(issueId: string, tx?: Tx): Promise<void> {
    const total = await this.timeLogsRepo.sumDurationForIssue(issueId, tx);
    await this.issuesRepo.updateSpent(issueId, total, tx);
  }
}
