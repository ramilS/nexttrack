import { Test, TestingModule } from '@nestjs/testing';
import { TimeLogSource } from '@prisma/client';
import { TimeReportsService } from './time-reports.service';
import {
  TimeLogsRepository,
  TimeLogReportEntry,
  TimeLogUserReportEntry,
} from './time-logs.repository';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('TimeReportsService', () => {
  let service: TimeReportsService;
  let timeLogsRepo: Mocked<TimeLogsRepository>;

  const now = new Date('2026-03-01T10:00:00.000Z');

  const reportLog = (overrides?: Partial<TimeLogReportEntry>): TimeLogReportEntry => ({
    id: 'log-1',
    userId: 'user-1',
    issueId: 'issue-1',
    duration: 120,
    date: now,
    description: 'desc',
    source: TimeLogSource.MANUAL,
    createdAt: now,
    user: { id: 'user-1', name: 'Alice', email: 'alice@test.local', avatarUrl: null },
    issue: { id: 'issue-1', number: 1, title: 'Test', projectKey: 'PRJ' },
    ...overrides,
  });

  const userReportLog = (overrides?: Partial<TimeLogUserReportEntry>): TimeLogUserReportEntry => ({
    id: 'log-1',
    issueId: 'issue-1',
    duration: 120,
    date: now.toISOString(),
    description: 'desc',
    source: TimeLogSource.MANUAL,
    createdAt: now.toISOString(),
    issue: {
      id: 'issue-1',
      number: 1,
      title: 'Test',
      projectKey: 'PRJ',
      projectName: 'Project',
    },
    ...overrides,
  });

  const baseDto = {
    dateFrom: '2026-03-01',
    dateTo: '2026-03-31',
    groupBy: 'USER' as const,
    page: 1,
    perPage: 50,
  };

  beforeEach(async () => {
    timeLogsRepo = {
      findReportLogs: jest.fn(),
      findUserReportLogs: jest.fn(),
    } as unknown as Mocked<TimeLogsRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeReportsService,
        { provide: TimeLogsRepository, useValue: timeLogsRepo },
      ],
    }).compile();

    service = module.get(TimeReportsService);
  });

  describe('getTimeReport', () => {
    it('returns structure with totalDuration and group summary', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([
        reportLog(),
        reportLog({ id: 'log-2', duration: 60 }),
      ]);

      const result = await service.getTimeReport('project-1', baseDto);

      expect(result.period).toEqual({ from: '2026-03-01', to: '2026-03-31' });
      expect(result.totalDuration).toBe(180);
      expect(result.totalDurationFormatted).toBe('3h');
      expect(result.summary).toEqual({ usersCount: 1, issuesCount: 1, logsCount: 2 });
    });

    it('groups by USER', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([
        reportLog(),
        reportLog({
          id: 'log-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@test.local', avatarUrl: null },
        }),
      ]);

      const result = await service.getTimeReport('project-1', { ...baseDto, groupBy: 'USER' });

      expect(result.groups.map((g) => g.key)).toEqual(['user-1', 'user-2']);
      expect(result.groups.map((g) => g.label)).toEqual(['Alice', 'Bob']);
    });

    it('groups by ISSUE', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([
        reportLog(),
        reportLog({
          id: 'log-2',
          issueId: 'issue-2',
          issue: { id: 'issue-2', number: 2, title: 'Second', projectKey: 'PRJ' },
        }),
      ]);

      const result = await service.getTimeReport('project-1', { ...baseDto, groupBy: 'ISSUE' });

      expect(result.groups.map((g) => g.label)).toEqual(['PRJ-1: Test', 'PRJ-2: Second']);
    });

    it('groups by DATE', async () => {
      const date2 = new Date('2026-03-02T10:00:00.000Z');
      timeLogsRepo.findReportLogs.mockResolvedValue([
        reportLog(),
        reportLog({ id: 'log-2', date: date2 }),
      ]);

      const result = await service.getTimeReport('project-1', { ...baseDto, groupBy: 'DATE' });

      expect(result.groups.map((g) => g.key)).toEqual(['2026-03-01', '2026-03-02']);
    });

    it('groups by USER_ISSUE with subGroups', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([
        reportLog(),
        reportLog({
          id: 'log-2',
          issueId: 'issue-2',
          issue: { id: 'issue-2', number: 2, title: 'Second', projectKey: 'PRJ' },
        }),
      ]);

      const result = await service.getTimeReport('project-1', {
        ...baseDto,
        groupBy: 'USER_ISSUE',
      });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].subGroups).toHaveLength(2);
    });

    it('returns empty groups when no logs', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([]);

      const result = await service.getTimeReport('project-1', baseDto);

      expect(result.totalDuration).toBe(0);
      expect(result.totalDurationFormatted).toBe('0m');
      expect(result.groups).toHaveLength(0);
      expect(result.summary).toEqual({ usersCount: 0, issuesCount: 0, logsCount: 0 });
    });

    it('passes userIds and issueIds filters to the repository', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([]);

      await service.getTimeReport('project-1', {
        ...baseDto,
        userIds: ['user-1'],
        issueIds: ['issue-1'],
      });

      expect(timeLogsRepo.findReportLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['user-1'],
          issueIds: ['issue-1'],
        }),
      );
    });
  });

  describe('getUserTimeReport', () => {
    it('returns formatted user report', async () => {
      timeLogsRepo.findUserReportLogs.mockResolvedValue([userReportLog()]);

      const result = await service.getUserTimeReport('user-1', {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });

      expect(result.totalDuration).toBe(120);
      expect(result.totalDurationFormatted).toBe('2h');
      expect(result.logs[0]).toMatchObject({
        id: 'log-1',
        issueId: 'issue-1',
        duration: 120,
        durationFormatted: '2h',
        description: 'desc',
        source: TimeLogSource.MANUAL,
        issue: {
          id: 'issue-1',
          number: 1,
          title: 'Test',
          projectKey: 'PRJ',
          projectName: 'Project',
        },
      });
    });

    it('forwards projectId filter to the repository', async () => {
      timeLogsRepo.findUserReportLogs.mockResolvedValue([]);

      await service.getUserTimeReport('user-1', {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
        projectId: 'project-1',
      });

      expect(timeLogsRepo.findUserReportLogs).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-1' }),
      );
    });

    it('returns empty logs when no data', async () => {
      timeLogsRepo.findUserReportLogs.mockResolvedValue([]);

      const result = await service.getUserTimeReport('user-1', {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });

      expect(result.totalDuration).toBe(0);
      expect(result.totalDurationFormatted).toBe('0m');
      expect(result.logs).toHaveLength(0);
    });
  });

  describe('exportReport', () => {
    it('exports CSV with header and rows', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([reportLog()]);

      const result = await service.exportReport('project-1', baseDto, 'csv');

      expect(result.contentType).toBe('text/csv');
      const lines = result.content.split('\n');
      expect(lines[0]).toBe('Date,User,Email,Issue,IssueTitle,Duration,Minutes,Description');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Alice');
      expect(lines[1]).toContain('PRJ-1');
      expect(lines[1]).toContain('120');
    });

    it('exports JSON with full report structure', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([reportLog()]);

      const result = await service.exportReport('project-1', baseDto, 'json');

      expect(result.contentType).toBe('application/json');
      const parsed = JSON.parse(result.content);
      expect(parsed.totalDuration).toBe(120);
      expect(parsed.period).toBeDefined();
    });

    it('produces empty CSV body when no logs', async () => {
      timeLogsRepo.findReportLogs.mockResolvedValue([]);

      const result = await service.exportReport('project-1', baseDto, 'csv');

      expect(result.content.split('\n')).toHaveLength(1);
    });
  });
});
