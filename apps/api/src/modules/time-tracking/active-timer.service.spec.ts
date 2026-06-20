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

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('ActiveTimerService', () => {
  let service: ActiveTimerService;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
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
      redis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ ...timerData, startedAt: new Date().toISOString() }));
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.startTimer('user-1', false, 'issue-1');

      expect(redis.set).toHaveBeenCalledWith(
        'timer:user-1',
        expect.any(String),
        24 * 60 * 60,
      );
    });

    it('throws ConflictError when a timer is already running', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));

      await expect(service.startTimer('user-1', false, 'issue-2')).rejects.toThrow(
        ConflictError,
      );
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
      redis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ ...timerData, startedAt: new Date().toISOString() }));
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.startTimer('admin-1', true, 'issue-1');

      expect(permissionsCache.getMembership).not.toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });
  });

  describe('stopTimer', () => {
    it('stops timer and creates a time log', async () => {
      redis.get.mockResolvedValue(JSON.stringify(timerData));
      issuesRepo.findStartTimerContext.mockResolvedValue({ id: 'issue-1', projectId: 'proj-1' });

      await service.stopTimer('user-1', false);

      expect(redis.del).toHaveBeenCalledWith('timer:user-1');
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
      expect(timeLogsService.createFromTimer).not.toHaveBeenCalled();
    });

    it('throws ValidationError when no timer is active', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.stopTimer('user-1', false)).rejects.toThrow(ValidationError);
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

      expect(redis.set).toHaveBeenCalledWith(
        'timer:user-1',
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
  });
});
