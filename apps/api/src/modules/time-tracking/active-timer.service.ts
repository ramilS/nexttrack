import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/common/errors/domain.errors';
import { RedisService } from '@/redis/redis.service';
import type { ActiveTimer } from '@repo/shared/schemas';
import { ErrorCode } from '@repo/shared/error-codes';
import { TimeLogsService } from './time-logs.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';

interface TimerRedisValue {
  issueId: string;
  startedAt: string;
  description: string | null;
}

const TIMER_KEY = (userId: string) => `timer:${userId}`;
const TIMER_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class ActiveTimerService {
  constructor(
    private redis: RedisService,
    private issuesRepo: IssuesReader,
    private membersRepo: ProjectMembersRepository,
    private timeLogsService: TimeLogsService,
  ) {}

  async getActiveTimer(userId: string): Promise<ActiveTimer | null> {
    const raw = await this.redis.get(TIMER_KEY(userId));
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

  async startTimer(userId: string, issueId: string, description?: string) {
    const existing = await this.redis.get(TIMER_KEY(userId));
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

    const isMember = await this.membersRepo.isMember(userId, issue.projectId);
    if (!isMember) {
      throw new PermissionDeniedError(ErrorCode.NOT_PROJECT_MEMBER);
    }

    const timerData: TimerRedisValue = {
      issueId,
      startedAt: new Date().toISOString(),
      description: description ?? null,
    };

    await this.redis.set(
      TIMER_KEY(userId),
      JSON.stringify(timerData),
      TIMER_TTL_SECONDS,
    );

    return this.getActiveTimer(userId);
  }

  async stopTimer(userId: string, description?: string) {
    const raw = await this.redis.get(TIMER_KEY(userId));
    if (!raw) {
      throw new ValidationError(ErrorCode.TIMER_NOT_RUNNING, 'No active timer');
    }

    const timer: TimerRedisValue = JSON.parse(raw);
    const durationMinutes = Math.max(
      1,
      Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000),
    );

    await this.redis.del(TIMER_KEY(userId));

    const finalDescription = description ?? timer.description;

    return this.timeLogsService.createFromTimer(
      timer.issueId,
      userId,
      durationMinutes,
      finalDescription,
    );
  }

  async discardTimer(userId: string) {
    await this.redis.del(TIMER_KEY(userId));
  }

  async updateTimerDescription(userId: string, description: string) {
    const raw = await this.redis.get(TIMER_KEY(userId));
    if (!raw) {
      throw new ValidationError(ErrorCode.TIMER_NOT_RUNNING, 'No active timer');
    }

    const timer: TimerRedisValue = JSON.parse(raw);
    timer.description = description;
    await this.redis.set(
      TIMER_KEY(userId),
      JSON.stringify(timer),
      TIMER_TTL_SECONDS,
    );

    return this.getActiveTimer(userId);
  }
}
