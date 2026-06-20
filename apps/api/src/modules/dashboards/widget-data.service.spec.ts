import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError } from '@/common/errors/domain.errors';
import { WidgetType } from '@prisma/client';
import { WidgetDataService } from './widget-data.service';
import { DashboardsRepository } from './dashboards.repository';
import { DashboardReportingRepository } from './dashboard-reporting.repository';

interface ItemsResult {
  items: Array<Record<string, unknown>>;
}

interface VelocityResult {
  averageVelocity: number;
}

describe('WidgetDataService', () => {
  let service: WidgetDataService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findWidgetWithDashboardOwner: jest.fn().mockResolvedValue(null),
      findWithWidgets: jest.fn().mockResolvedValue(null),
      findWatchedIssueIds: jest.fn().mockResolvedValue([]),
      findIssueList: jest.fn().mockResolvedValue([]),
      findUserMemberProjectIds: jest.fn().mockResolvedValue([]),
      findOverdueIssues: jest.fn().mockResolvedValue([]),
      findRecentActivities: jest.fn().mockResolvedValue([]),
      findProjectsForProgress: jest.fn().mockResolvedValue([]),
      countResolvedIssuesByStatus: jest.fn().mockResolvedValue(new Map()),
      findTimeLogsForUserBetween: jest.fn().mockResolvedValue([]),
      groupIssuesByStatus: jest.fn().mockResolvedValue([]),
      groupIssuesByPriority: jest.fn().mockResolvedValue([]),
      groupIssuesByType: jest.fn().mockResolvedValue([]),
      findActiveSprintForProjects: jest.fn().mockResolvedValue(null),
      findResolvedByDayForSprint: jest.fn().mockResolvedValue([]),
      findClosedSprintsForProjects: jest.fn().mockResolvedValue([]),
      findCfdDailyCounts: jest.fn().mockResolvedValue([]),
      findWorkflowStatusBlobs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetDataService,
        // One mock backs both repos — it carries every method the service calls,
        // so CRUD (this.repo) and reporting (this.reporting) routes both resolve.
        { provide: DashboardsRepository, useValue: repo },
        { provide: DashboardReportingRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(WidgetDataService);
  });

  describe('getWidgetData', () => {
    it('throws NotFound when widget missing', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue(null);

      await expect(service.getWidgetData('user-1', 'w1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFound when widget belongs to another user', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.MY_ISSUES,
        title: 'X',
        config: {},
        ownerUserId: 'other-user',
      });

      await expect(service.getWidgetData('user-1', 'w1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('dispatches based on widget type', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.MY_ISSUES,
        title: 'My Issues',
        config: {},
        ownerUserId: 'user-1',
      });
      repo.findIssueList.mockResolvedValue([]);

      const result = await service.getWidgetData('user-1', 'w1');

      expect(repo.findIssueList).toHaveBeenCalled();
      expect(result).toEqual({ items: [] });
    });
  });

  describe('getAllWidgetData', () => {
    it('throws NotFound when dashboard missing', async () => {
      repo.findWithWidgets.mockResolvedValue(null);

      await expect(service.getAllWidgetData('user-1', 'd1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFound when dashboard belongs to another user', async () => {
      repo.findWithWidgets.mockResolvedValue({
        id: 'd1',
        userId: 'other',
        widgets: [],
      });

      await expect(service.getAllWidgetData('user-1', 'd1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('returns null for widgets that fail and data for those that succeed', async () => {
      repo.findWithWidgets.mockResolvedValue({
        id: 'd1',
        userId: 'user-1',
        widgets: [
          { id: 'w1', type: WidgetType.MY_ISSUES, config: {} },
          { id: 'w2', type: WidgetType.ASSIGNED_TO_ME, config: {} },
        ],
      });
      repo.findIssueList
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('boom'));

      const result = await service.getAllWidgetData('user-1', 'd1');

      expect(result).toEqual({ w1: { items: [] }, w2: null });
    });
  });

  describe('widget handlers', () => {
    it('PROJECT_PROGRESS computes progress with resolved status filter', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.PROJECT_PROGRESS,
        title: 'PP',
        config: {},
        ownerUserId: 'user-1',
      });
      repo.findUserMemberProjectIds.mockResolvedValue(['p1']);
      repo.findProjectsForProgress.mockResolvedValue([
        {
          key: 'P1',
          name: 'P1',
          color: '#000',
          totalIssues: 10,
          workflows: [
            {
              statuses: [
                { id: 's1', name: 'Done', isResolved: true, color: '#0f0' },
              ],
            },
          ],
        },
      ]);
      repo.countResolvedIssuesByStatus.mockResolvedValue(new Map([['s1', 4]]));

      const result = (await service.getWidgetData('user-1', 'w1')) as ItemsResult;

      expect(result.items[0]).toMatchObject({
        key: 'P1',
        openIssueCount: 6,
        totalIssueCount: 10,
        progress: 0.4,
      });
    });

    it('OVERDUE_ISSUES returns issues with ISO dueDate', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.OVERDUE_ISSUES,
        title: 'O',
        config: {},
        ownerUserId: 'user-1',
      });
      const due = new Date('2026-01-01T00:00:00.000Z');
      repo.findOverdueIssues.mockResolvedValue([
        {
          id: 'i1',
          number: 1,
          title: 't',
          priority: 'HIGH',
          dueDate: due,
          projectKey: 'P',
        },
      ]);

      const result = (await service.getWidgetData('user-1', 'w1')) as ItemsResult;

      expect(result.items[0]).toMatchObject({
        id: 'i1',
        projectKey: 'P',
        number: 1,
        priority: 'HIGH',
        dueDate: due.toISOString(),
      });
    });

    it('VELOCITY_MINI returns 0 average when no closed sprints', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.VELOCITY_MINI,
        title: 'V',
        config: {},
        ownerUserId: 'user-1',
      });
      repo.findClosedSprintsForProjects.mockResolvedValue([]);

      const result = await service.getWidgetData('user-1', 'w1');

      expect(result).toEqual({ sprints: [], averageVelocity: 0 });
    });

    it('VELOCITY_MINI computes average velocity', async () => {
      repo.findWidgetWithDashboardOwner.mockResolvedValue({
        id: 'w1',
        dashboardId: 'd1',
        type: WidgetType.VELOCITY_MINI,
        title: 'V',
        config: {},
        ownerUserId: 'user-1',
      });
      repo.findClosedSprintsForProjects.mockResolvedValue([
        { name: 'S2', totalIssues: 10, completedIssues: 8 },
        { name: 'S1', totalIssues: 10, completedIssues: 4 },
      ]);

      const result = (await service.getWidgetData('user-1', 'w1')) as VelocityResult;

      expect(result.averageVelocity).toBe(6);
    });
  });
});
