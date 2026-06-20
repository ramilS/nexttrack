import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { ValkeyService } from '@/valkey/valkey.service';
import type { ActiveTimer } from '@repo/shared/schemas';
import { ErrorCode } from '@repo/shared/error-codes';
import { Permission } from '@repo/shared';
import { TimeLogsService } from './time-logs.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';

interface TimerRedisValue {
  issueId: string;
  startedAt: string;
  description: string | null;
}

const TIMER_KEY = (userId: string) => `timer:${userId}`;
const TIMER_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class ActiveTimerService {
  private readonly logger = new AppLogger(ActiveTimerService.name);

  constructor(
    private valkey: ValkeyService,
    private issuesRepo: IssuesReader,
    private membersRepo: ProjectMembersRepository,
    private permissionsCache: PermissionsCacheService,
    private timeLogsService: TimeLogsService,
  ) {}

  /**
   * Timer routes are user-scoped (no :issueId in the URL), so the
   * @RequirePermission guard the manual time-log endpoint uses can't run here.
   * Enforce TIME_LOG_OWN on the issue's project in-service instead, mirroring
   * the guard (global admins bypass) so the timer isn't a weaker path to the
   * same time-log artifact.
   */
  private async assertCanLogTime(
    userId: string,
    isAdmin: boolean,
    projectId: string,
  ): Promise<void> {
    if (isAdmin) return;
    const member = await this.permissionsCache.getMembership(userId, projectId, () =>
      this.membersRepo.findMembershipWithPermissions(userId, projectId),
    );
    if (!member) {
      throw new PermissionDeniedError(ErrorCode.NOT_PROJECT_MEMBER);
    }
    if (!member.permissions.includes(Permission.TIME_LOG_OWN)) {
      throw new PermissionDeniedError(ErrorCode.FORBIDDEN);
    }
  }

  async getActiveTimer(userId: string): Promise<ActiveTimer | null> {
    const raw = await this.valkey.get(TIMER_KEY(userId));
    if (!raw) return null;

    const timer: TimerRedisValue = JSON.parse(raw);
    const elapsed = Math.floor(
      (Date.now() - new Date(timer.startedAt).getTime()) / 1000,
    );

    const issue = await this.issuesRepo.findTimerDisplay(timer.issueId);

    return {
      issueId: timer.issueId,
      issue,
      startedAt: timer.startedAt,
      elapsed,
      description: timer.description,
    };
  }

  async startTimer(
    userId: string,
    isAdmin: boolean,
    issueId: string,
    description?: string,
  ) {
    const existing = await this.valkey.get(TIMER_KEY(userId));
    if (existing) {
      const activeTimer = await this.getActiveTimer(userId);
      throw new ConflictError(ErrorCode.TIMER_ALREADY_RUNNING, 'Timer is already running', {
        activeTimer,
      });
    }

    const issue = await this.issuesRepo.findStartTimerContext(issueId);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }

    await this.assertCanLogTime(userId, isAdmin, issue.projectId);

    const timerData: TimerRedisValue = {
      issueId,
      startedAt: new Date().toISOString(),
      description: description ?? null,
    };

    await this.valkey.set(
      TIMER_KEY(userId),
      JSON.stringify(timerData),
      TIMER_TTL_SECONDS,
    );
    this.logger.log('Timer started', { issueId, userId });

    return this.getActiveTimer(userId);
  }

  async stopTimer(userId: string, isAdmin: boolean, description?: string) {
    const raw = await this.valkey.get(TIMER_KEY(userId));
    if (!raw) {
      throw new ValidationError(ErrorCode.TIMER_NOT_RUNNING, 'No active timer');
    }

    const timer: TimerRedisValue = JSON.parse(raw);

    // Re-check on stop: membership/role may have changed since start.
    const issue = await this.issuesRepo.findStartTimerContext(timer.issueId);
    if (!issue) {
      throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
    }
    await this.assertCanLogTime(userId, isAdmin, issue.projectId);

    const durationMinutes = Math.max(
      1,
      Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000),
    );

    await this.valkey.del(TIMER_KEY(userId));
    this.logger.log('Timer stopped', {
      issueId: timer.issueId,
      userId,
      durationMinutes,
    });

    const finalDescription = description ?? timer.description;

    return this.timeLogsService.createFromTimer(
      timer.issueId,
      userId,
      durationMinutes,
      finalDescription,
    );
  }

  async discardTimer(userId: string) {
    await this.valkey.del(TIMER_KEY(userId));
    this.logger.log('Timer discarded', { userId });
  }

  async updateTimerDescription(userId: string, description: string) {
    const raw = await this.valkey.get(TIMER_KEY(userId));
    if (!raw) {
      throw new ValidationError(ErrorCode.TIMER_NOT_RUNNING, 'No active timer');
    }

    const timer: TimerRedisValue = JSON.parse(raw);
    timer.description = description;
    await this.valkey.set(
      TIMER_KEY(userId),
      JSON.stringify(timer),
      TIMER_TTL_SECONDS,
    );

    return this.getActiveTimer(userId);
  }
}
