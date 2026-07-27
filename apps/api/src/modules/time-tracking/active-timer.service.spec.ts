import { Test, TestingModule } from '@nestjs/testing';
import {
  ValidationError,
  ConflictError,
  PermissionDeniedError,
  NotFoundError,
} from '@/common/errors/domain.errors';
import { ActiveTimerService } from './active-timer.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { TimeLogsService } from './time-logs.service';
import { IssuesReader } from '@/modules/issues/issues.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { PermissionsCacheService } from '@/common/cache/permissions-cache.service';
import { ErrorCode } from '@repo/shared/error-codes';

type Mocked<T> = { [K in keyof T]: jest.Mock };

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}

describe('ActiveTimerService', () => {
  let service: ActiveTimerService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    setIfAbsent: jest.Mock;
    compareAndDelete: jest.Mock;
    compareAndSet: jest.Mock;
    del: jest.Mock;
  };
  let issuesRepo: Mocked<IssuesReader>;
  let membersRepo: Mocked<ProjectMembersRepository>;
  let permissionsCache: { getMembership: jest.Mock };
  let timeLogsService: { createFromTimer: jest.Mock };

  const timerData = {
    issueId: 'issue-1',
    startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    description: null,
  };

  const display = {
    id: 'issue-1',
    number: 1,
    title: 'Test',
    projectKey: 'PRJ',
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setIfAbsent: jest.fn().mockResolvedValue(true),
      compareAndDelete: jest.fn().mockResolvedValue(true),
      compareAndSet: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1),
    };
    issuesRepo = {
      findTimerDisplay: jest.fn().mockResolvedValue(display),
      findStartTimerContext: jest.fn(),
    } as unknown as Mocked<IssuesReader>;
    membersRepo = {
      isMember: jest.fn().mockResolvedValue(true),
      findMembershipWithPermissions: jest.fn(),
    } as unknown as Mocked<ProjectMembersRepository>;
    permissionsCache = {
      getMembership: jest.fn().mockResolvedValue({
        userId: 'user-1',
        projectId: 'proj-1',
        roleId: 'role-1',
        permissions: ['TIME_LOG_OWN'],
      }),
    };
    timeLogsService = { createFromTimer: jest.fn().mockResolvedValue({ id: 'log-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveTimerService,
        { provide: ValkeyService, useValue: redis },
        { provide: IssuesReader, useValue: issuesRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: PermissionsCacheService, useValue: permissionsCache },
        { provide: TimeLogsService, useValue: timeLogsService },
      ],
    }).compile();

    service = module.get(ActiveTimerService);
  });

  describe('getActiveTimer', () => {
    it('returns null when no timer exists', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.getActiveTimer('user-1');
      expect(result).toBeNull();
    });

    it('returns timer with elapsed time and issue display', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));

      const result = await service.getActiveTimer('user-1');

      expect(result).not.toBeNull();
      expect(result!.issueId).toBe('issue-1');
      expect(result!.elapsed).toBeGreaterThanOrEqual(0);
      expect(result!.issue).toEqual(display);
    });
  });

  describe('startTimer', () => {
    it('starts a timer when none is active', async () => {
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.startTimer('user-1', false, 'issue-1');

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        'timer:user-1',
        expect.any(String),
        24 * 60 * 60,
      );
      const stored = JSON.parse(redis.setIfAbsent.mock.calls[0][1]);
      expect(stored.timerId).toEqual(expect.any(String));
    });

    it('throws ConflictError when a timer is already running', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));

      await expect(service.startTimer('user-1', false, 'issue-2')).rejects.toThrow(
        ConflictError,
      );
    });

    it.each(['missing-issue', 'forbidden-issue'])(
      'prioritizes an existing timer over validation of %s',
      async (requestedIssueId) => {
        redis.get.mockResolvedValue(JSON.stringify(timerData));

        await expect(service.startTimer('user-1', false, requestedIssueId)).rejects.toMatchObject({
          code: ErrorCode.TIMER_ALREADY_RUNNING,
        });

        expect(issuesRepo.findStartTimerContext).not.toHaveBeenCalled();
        expect(redis.setIfAbsent).not.toHaveBeenCalled();
      },
    );

    it('throws TIMER_ALREADY_RUNNING when setIfAbsent loses the start race', async () => {
      redis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify(timerData));
      redis.setIfAbsent.mockResolvedValue(false);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await expect(service.startTimer('user-1', false, 'issue-1')).rejects.toMatchObject({
        code: ErrorCode.TIMER_ALREADY_RUNNING,
      });
    });

    it('throws NotFoundError for missing or deleted issue', async () => {
      redis.get.mockResolvedValue(null);
      issuesRepo.findStartTimerContext.mockResolvedValue(null);

      await expect(service.startTimer('user-1', false, 'issue-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws PermissionDeniedError when user is not a project member', async () => {
      redis.get.mockResolvedValue(null);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });
      permissionsCache.getMembership.mockResolvedValue(null);

      await expect(service.startTimer('user-1', false, 'issue-1')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('throws PermissionDeniedError when the member lacks TIME_LOG_OWN', async () => {
      redis.get.mockResolvedValue(null);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });
      permissionsCache.getMembership.mockResolvedValue({
        userId: 'user-1',
        projectId: 'proj-1',
        roleId: 'observer',
        permissions: ['ISSUE_READ'],
      });

      await expect(service.startTimer('user-1', false, 'issue-1')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('lets a global admin start a timer without TIME_LOG_OWN', async () => {
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.startTimer('admin-1', true, 'issue-1');

      expect(permissionsCache.getMembership).not.toHaveBeenCalled();
      expect(redis.setIfAbsent).toHaveBeenCalled();
    });
  });

  describe('stopTimer', () => {
    it('stops timer and creates a time log', async () => {
      const rawTimer = JSON.stringify(timerData);
      redis.get.mockResolvedValue(rawTimer);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.stopTimer('user-1', false);

      expect(redis.compareAndDelete).toHaveBeenCalledWith('timer:user-1', rawTimer);
      expect(timeLogsService.createFromTimer).toHaveBeenCalledWith(
        'issue-1',
        'user-1',
        expect.any(Number),
        null,
      );
    });

    it('prefers the provided description over the timer description', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ ...timerData, description: 'old' }));
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.stopTimer('user-1', false, 'new description');

      expect(timeLogsService.createFromTimer).toHaveBeenCalledWith(
        'issue-1',
        'user-1',
        expect.any(Number),
        'new description',
      );
    });

    it('re-checks TIME_LOG_OWN on stop and rejects if revoked', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });
      permissionsCache.getMembership.mockResolvedValue(null);

      await expect(service.stopTimer('user-1', false)).rejects.toThrow(
        PermissionDeniedError,
      );
      expect(redis.compareAndDelete).not.toHaveBeenCalled();
      expect(timeLogsService.createFromTimer).not.toHaveBeenCalled();
    });

    it('retains the timer when its issue was deleted before stop', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));
      issuesRepo.findStartTimerContext.mockResolvedValue(null);

      await expect(service.stopTimer('user-1', false)).rejects.toThrow(NotFoundError);

      expect(redis.compareAndDelete).not.toHaveBeenCalled();
      expect(timeLogsService.createFromTimer).not.toHaveBeenCalled();
    });

    it('throws ValidationError when no timer is active', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.stopTimer('user-1', false)).rejects.toThrow(ValidationError);
    });

    it('creates one time log when a concurrent stop loses the race', async () => {
      const rawTimer = JSON.stringify(timerData);
      const firstCompareReached = deferred<void>();
      const secondCompareReached = deferred<void>();
      const releaseFirstCompare = deferred<void>();
      let compareCall = 0;

      redis.get.mockResolvedValue(rawTimer);
      redis.compareAndDelete.mockImplementation(async () => {
        compareCall += 1;
        if (compareCall === 1) {
          firstCompareReached.resolve();
          await releaseFirstCompare.promise;
          return true;
        }
        secondCompareReached.resolve();
        return false;
      });
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      const firstStop = service.stopTimer('user-1', false);
      await firstCompareReached.promise;
      const secondStop = service.stopTimer('user-1', false).catch((error: unknown) => error);
      await secondCompareReached.promise;
      releaseFirstCompare.resolve();

      const [, secondStopError] = await Promise.all([firstStop, secondStop]);

      expect(secondStopError).toMatchObject({ code: ErrorCode.TIMER_NOT_RUNNING });
      expect(redis.compareAndDelete).toHaveBeenCalledTimes(2);
      expect(timeLogsService.createFromTimer).toHaveBeenCalledTimes(1);
    });

    it('does not delete a replacement timer when the observed value changes', async () => {
      const rawTimer = JSON.stringify(timerData);
      redis.get.mockResolvedValue(rawTimer);
      redis.compareAndDelete.mockResolvedValue(false);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await expect(service.stopTimer('user-1', false)).rejects.toMatchObject({
        code: ErrorCode.TIMER_NOT_RUNNING,
      });

      expect(redis.compareAndDelete).toHaveBeenCalledWith('timer:user-1', rawTimer);
      expect(timeLogsService.createFromTimer).not.toHaveBeenCalled();
    });

    it('retries an updated description as the same logical timer', async () => {
      const rawTimer = JSON.stringify({ ...timerData, timerId: 'timer-1' });
      const updatedTimer = JSON.stringify({ ...timerData, timerId: 'timer-1', description: 'updated' });
      redis.get.mockResolvedValueOnce(rawTimer).mockResolvedValueOnce(updatedTimer);
      redis.compareAndDelete.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.stopTimer('user-1', false);

      expect(redis.compareAndDelete).toHaveBeenNthCalledWith(2, 'timer:user-1', updatedTimer);
      expect(timeLogsService.createFromTimer).toHaveBeenCalledWith(
        'issue-1',
        'user-1',
        expect.any(Number),
        'updated',
      );
    });

    it('does not delete a genuinely new replacement after retrying', async () => {
      const rawTimer = JSON.stringify({ ...timerData, timerId: 'timer-1' });
      const replacement = JSON.stringify({ ...timerData, issueId: 'issue-2', timerId: 'timer-2' });
      redis.get.mockResolvedValueOnce(rawTimer).mockResolvedValueOnce(replacement);
      redis.compareAndDelete.mockResolvedValue(false);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await expect(service.stopTimer('user-1', false)).rejects.toMatchObject({
        code: ErrorCode.TIMER_NOT_RUNNING,
      });

      expect(redis.compareAndDelete).toHaveBeenCalledTimes(1);
      expect(timeLogsService.createFromTimer).not.toHaveBeenCalled();
    });
  });

  describe('discardTimer', () => {
    it('removes the timer from Redis', async () => {
      await service.discardTimer('user-1');
      expect(redis.del).toHaveBeenCalledWith('timer:user-1');
    });
  });

  describe('updateTimerDescription', () => {
    it('updates the description in Redis', async () => {
      redis.get
        .mockResolvedValueOnce(JSON.stringify(timerData))
        .mockResolvedValueOnce(JSON.stringify({ ...timerData, description: 'updated' }));

      await service.updateTimerDescription('user-1', 'updated');

      expect(redis.compareAndSet).toHaveBeenCalledWith(
        'timer:user-1',
        JSON.stringify(timerData),
        expect.stringContaining('"description":"updated"'),
        24 * 60 * 60,
      );
    });

    it('throws ValidationError when no timer is active', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.updateTimerDescription('user-1', 'desc')).rejects.toThrow(
        ValidationError,
      );
    });

    it('does not restore a timer removed by a concurrent stop', async () => {
      const rawTimer = JSON.stringify(timerData);
      let resolveUpdate: (updated: boolean) => void;
      const updateResult = new Promise<boolean>((resolve) => {
        resolveUpdate = resolve;
      });
      redis.get.mockResolvedValue(rawTimer);
      redis.compareAndSet.mockReturnValue(updateResult);
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      const update = service.updateTimerDescription('user-1', 'updated');
      await Promise.resolve();
      await service.stopTimer('user-1', false);
      resolveUpdate!(false);

      await expect(update).rejects.toMatchObject({ code: ErrorCode.TIMER_NOT_RUNNING });
      expect(redis.compareAndDelete).toHaveBeenCalledWith('timer:user-1', rawTimer);
      expect(timeLogsService.createFromTimer).toHaveBeenCalledTimes(1);
    });

    it('does not restore a timer discarded while its description update is pending', async () => {
      const rawTimer = JSON.stringify(timerData);
      const updateCompareReached = deferred<void>();
      const releaseUpdateCompare = deferred<void>();
      let storedTimer: string | null = rawTimer;

      redis.get.mockImplementation(async () => storedTimer);
      redis.del.mockImplementation(async () => {
        storedTimer = null;
        return 1;
      });
      redis.compareAndSet.mockImplementation(async (_key, expectedValue, value) => {
        updateCompareReached.resolve();
        await releaseUpdateCompare.promise;
        if (storedTimer !== expectedValue) return false;
        storedTimer = value;
        return true;
      });

      const update = service.updateTimerDescription('user-1', 'updated').catch((error: unknown) => error);
      await updateCompareReached.promise;
      const discard = service.discardTimer('user-1');
      releaseUpdateCompare.resolve();

      const [, updateError] = await Promise.all([discard, update]);

      expect(updateError).toMatchObject({ code: ErrorCode.TIMER_NOT_RUNNING });
      expect(storedTimer).toBeNull();
      expect(redis.del).toHaveBeenCalledWith('timer:user-1');
    });
  });
});
