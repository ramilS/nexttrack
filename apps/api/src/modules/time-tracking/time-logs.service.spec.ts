import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundError,
  ValidationError,
  PermissionDeniedError,
} from '@/common/errors/domain.errors';
import { TimeLogSource } from '@prisma/client';
import { TimeLogsService } from './time-logs.service';
import { TimeLogsRepository } from './time-logs.repository';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { ActivitiesService } from '@/modules/activities/activities.service';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('TimeLogsService', () => {
  let service: TimeLogsService;
  let timeLogsRepo: Mocked<TimeLogsRepository>;
  let issuesRepo: Mocked<IssuesRepository>;
  let activitiesService: { recordOne: jest.Mock };

  const buildLog = (overrides?: Partial<Record<string, unknown>>) => ({
    id: 'log-1',
    issueId: 'issue-1',
    user: { id: 'user-1', name: 'Test', email: 't@t.local', avatarUrl: null },
    duration: 60,
    durationFormatted: '1h',
    date: '2026-03-01T00:00:00.000Z',
    description: null,
    source: TimeLogSource.MANUAL,
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    timeLogsRepo = {
      findPage: jest.fn(),
      findOwnership: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      sumDurationForIssue: jest.fn().mockResolvedValue(0),
      findReportLogs: jest.fn(),
      findUserReportLogs: jest.fn(),
    } as unknown as Mocked<TimeLogsRepository>;

    issuesRepo = {
      findCreateContext: jest.fn(),
      updateSpent: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IssuesRepository>;

    activitiesService = { recordOne: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeLogsService,
        { provide: TimeLogsRepository, useValue: timeLogsRepo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: ActivitiesService, useValue: activitiesService },
      ],
    }).compile();

    service = module.get(TimeLogsService);
  });

  describe('findAll', () => {
    it('passes pageSize default 25 to the repository', async () => {
      timeLogsRepo.findPage.mockResolvedValue({
        items: [buildLog()],
        meta: { nextCursor: null, pageSize: 25, hasNextPage: false },
      });

      const result = await service.findAll('issue-1');

      expect(timeLogsRepo.findPage).toHaveBeenCalledWith(
        'issue-1',
        expect.objectContaining({ pageSize: 25 }),
      );
      expect(result.items).toHaveLength(1);
    });

    it('forwards filter options', async () => {
      timeLogsRepo.findPage.mockResolvedValue({
        items: [],
        meta: { nextCursor: null, pageSize: 10, hasNextPage: false },
      });

      await service.findAll('issue-1', {
        pageSize: 10,
        userId: 'user-1',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });

      expect(timeLogsRepo.findPage).toHaveBeenCalledWith('issue-1', {
        cursor: undefined,
        pageSize: 10,
        userId: 'user-1',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });
    });
  });

  describe('create', () => {
    it('creates a time log and recalculates spent', async () => {
      issuesRepo.findCreateContext.mockResolvedValue({
        id: 'issue-1',
        projectArchivedAt: null,
      });
      timeLogsRepo.create.mockResolvedValue(buildLog() as never);
      timeLogsRepo.sumDurationForIssue.mockResolvedValue(60);

      const result = await service.create('issue-1', 'user-1', {
        duration: 60,
        date: '2026-03-01',
      } as never);

      expect(result.duration).toBe(60);
      expect(timeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: 'issue-1',
          userId: 'user-1',
          duration: 60,
          source: TimeLogSource.MANUAL,
        }),
      );
      expect(issuesRepo.updateSpent).toHaveBeenCalledWith('issue-1', 60);
      expect(activitiesService.recordOne).toHaveBeenCalled();
    });

    it('throws NotFoundError when issue is missing', async () => {
      issuesRepo.findCreateContext.mockResolvedValue(null);

      await expect(
        service.create('missing', 'user-1', { duration: 60 } as never),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws PermissionDeniedError when project is archived', async () => {
      issuesRepo.findCreateContext.mockResolvedValue({
        id: 'issue-1',
        projectArchivedAt: new Date(),
      });

      await expect(
        service.create('issue-1', 'user-1', { duration: 60 } as never),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('parses string duration like "2h 30m"', () => {
      expect(service.parseDuration('2h 30m')).toBe(150);
    });

    it('throws for duration less than 1', () => {
      expect(() => service.parseDuration(0)).toThrow(ValidationError);
    });

    it('throws when a numeric duration exceeds the max (Int32 overflow guard)', () => {
      expect(() => service.parseDuration(60 * 24 * 366 + 1)).toThrow(
        ValidationError,
      );
    });

    it('throws when a parsed string duration exceeds the max', () => {
      // 9000h = 540000 min, above the ~527040 (one year) cap
      expect(() => service.parseDuration('9000h')).toThrow(ValidationError);
    });

    it('accepts a duration exactly at the max', () => {
      expect(service.parseDuration(60 * 24 * 366)).toBe(60 * 24 * 366);
    });
  });

  describe('update', () => {
    it('updates a log when called by its owner', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue({
        id: 'log-1',
        issueId: 'issue-1',
        userId: 'user-1',
        duration: 60,
      });
      timeLogsRepo.update.mockResolvedValue(buildLog({ duration: 90, durationFormatted: '1h 30m' }) as never);
      timeLogsRepo.sumDurationForIssue.mockResolvedValue(90);

      const result = await service.update('issue-1', 'log-1', 'user-1', {
        duration: 90,
      } as never);

      expect(result.duration).toBe(90);
      expect(timeLogsRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ duration: 90 }),
      );
      expect(issuesRepo.updateSpent).toHaveBeenCalledWith('issue-1', 90);
    });

    it('throws NotFoundError for missing log', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue(null);

      await expect(
        service.update('issue-1', 'missing', 'user-1', {} as never),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws PermissionDeniedError for non-owner non-admin', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue({
        id: 'log-1',
        issueId: 'issue-1',
        userId: 'user-1',
        duration: 60,
      });

      await expect(
        service.update('issue-1', 'log-1', 'other-user', {} as never, 'DEVELOPER'),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('allows ADMIN role to update other users logs', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue({
        id: 'log-1',
        issueId: 'issue-1',
        userId: 'user-1',
        duration: 60,
      });
      timeLogsRepo.update.mockResolvedValue(buildLog() as never);

      await service.update('issue-1', 'log-1', 'other-user', { duration: 60 } as never, 'ADMIN');

      expect(timeLogsRepo.update).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('soft-deletes the log and recalculates spent', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue({
        id: 'log-1',
        issueId: 'issue-1',
        userId: 'user-1',
        duration: 60,
      });
      timeLogsRepo.sumDurationForIssue.mockResolvedValue(0);

      await service.softDelete('issue-1', 'log-1', 'user-1');

      expect(timeLogsRepo.softDelete).toHaveBeenCalledWith('log-1', 'user-1');
      expect(issuesRepo.updateSpent).toHaveBeenCalledWith('issue-1', 0);
    });

    it('throws PermissionDeniedError for non-owner non-admin', async () => {
      timeLogsRepo.findOwnership.mockResolvedValue({
        id: 'log-1',
        issueId: 'issue-1',
        userId: 'user-1',
        duration: 60,
      });

      await expect(
        service.softDelete('issue-1', 'log-1', 'other-user', 'DEVELOPER'),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('createFromTimer', () => {
    it('creates with minimum 1 minute and TIMER source', async () => {
      timeLogsRepo.create.mockResolvedValue(buildLog({ duration: 1, source: TimeLogSource.TIMER }) as never);

      await service.createFromTimer('issue-1', 'user-1', 0);

      expect(timeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 1, source: TimeLogSource.TIMER }),
      );
    });
  });
});
