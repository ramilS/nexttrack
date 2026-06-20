import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError, PermissionDeniedError } from '@/common/errors/domain.errors';
import { DashboardsService } from './dashboards.service';
import { DashboardsRepository } from './dashboards.repository';
import type { AddWidgetParsed, CreateDashboardParsed } from '@repo/shared/schemas';

const baseDashboard = {
  id: 'dash-1',
  userId: 'user-1',
  name: 'My Dashboard',
  isDefault: false,
  layout: [],
  widgets: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DashboardsService', () => {
  let service: DashboardsService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findAllByUser: jest.fn().mockResolvedValue([]),
      findWithWidgets: jest.fn().mockResolvedValue(null),
      findDefaultForUserWithWidgets: jest.fn().mockResolvedValue(null),
      unsetDefaultForUser: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(baseDashboard),
      update: jest.fn().mockResolvedValue(baseDashboard),
      delete: jest.fn().mockResolvedValue(undefined),
      createWithDefaultWidgets: jest.fn().mockResolvedValue(baseDashboard),
      findWidgetWithDashboardOwner: jest.fn().mockResolvedValue(null),
      findWidgetInDashboard: jest.fn().mockResolvedValue(null),
      createWidget: jest.fn(),
      updateWidget: jest.fn(),
      deleteWidget: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        { provide: DashboardsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(DashboardsService);
  });

  describe('findAll', () => {
    it('returns mapped dashboards', async () => {
      repo.findAllByUser.mockResolvedValue([baseDashboard]);

      const result = await service.findAll('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('dash-1');
    });
  });

  describe('findOne', () => {
    it('throws NotFound when missing', async () => {
      repo.findWithWidgets.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'd1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws Forbidden when not owner', async () => {
      repo.findWithWidgets.mockResolvedValue({
        ...baseDashboard,
        userId: 'other-user',
      });

      await expect(service.findOne('user-1', 'd1')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('returns mapped dashboard when owned', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);

      const result = await service.findOne('user-1', 'dash-1');

      expect(result.id).toBe('dash-1');
    });
  });

  describe('create', () => {
    it('unsets previous default when creating default dashboard', async () => {
      await service.create('user-1', {
        name: 'New',
        isDefault: true,
      } satisfies CreateDashboardParsed);

      expect(repo.unsetDefaultForUser).toHaveBeenCalledWith('user-1');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', isDefault: true }),
      );
    });

    it('does not unset default when creating non-default dashboard', async () => {
      await service.create('user-1', {
        name: 'New',
        isDefault: false,
      } satisfies CreateDashboardParsed);

      expect(repo.unsetDefaultForUser).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('checks ownership before update', async () => {
      repo.findWithWidgets.mockResolvedValue({
        ...baseDashboard,
        userId: 'other-user',
      });

      await expect(
        service.update('user-1', 'dash-1', { name: 'X' }),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('unsets other default dashboards when promoting to default', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);

      await service.update('user-1', 'dash-1', { isDefault: true });

      expect(repo.unsetDefaultForUser).toHaveBeenCalledWith('user-1', 'dash-1');
    });
  });

  describe('remove', () => {
    it('deletes after ownership check', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);

      await service.remove('user-1', 'dash-1');

      expect(repo.delete).toHaveBeenCalledWith('dash-1');
    });
  });

  describe('addWidget', () => {
    it('creates a widget after ownership check', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);
      repo.createWidget.mockResolvedValue({
        id: 'w1',
        dashboardId: 'dash-1',
        type: 'MY_ISSUES',
        title: 'My Issues',
        config: {},
      });

      const result = await service.addWidget('user-1', 'dash-1', {
        type: 'MY_ISSUES',
        title: 'My Issues',
        config: {},
      } satisfies AddWidgetParsed);

      expect(repo.createWidget).toHaveBeenCalledWith(
        expect.objectContaining({ dashboardId: 'dash-1' }),
      );
      expect(result.id).toBe('w1');
    });
  });

  describe('updateWidget', () => {
    it('throws NotFound when widget missing', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);
      repo.findWidgetInDashboard.mockResolvedValue(null);

      await expect(
        service.updateWidget('user-1', 'dash-1', 'w1', { title: 'X' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeWidget', () => {
    it('deletes widget after ownership + existence check', async () => {
      repo.findWithWidgets.mockResolvedValue(baseDashboard);
      repo.findWidgetInDashboard.mockResolvedValue({ id: 'w1' });

      await service.removeWidget('user-1', 'dash-1', 'w1');

      expect(repo.deleteWidget).toHaveBeenCalledWith('w1');
    });
  });

  describe('getOrCreateDefault', () => {
    it('returns existing default when present', async () => {
      repo.findDefaultForUserWithWidgets.mockResolvedValue({
        ...baseDashboard,
        isDefault: true,
      });

      const result = await service.getOrCreateDefault('user-1');

      expect(result.id).toBe('dash-1');
      expect(repo.createWithDefaultWidgets).not.toHaveBeenCalled();
    });

    it('creates default when missing', async () => {
      repo.findDefaultForUserWithWidgets.mockResolvedValue(null);
      repo.createWithDefaultWidgets.mockResolvedValue({
        ...baseDashboard,
        isDefault: true,
      });

      const result = await service.getOrCreateDefault('user-1');

      expect(repo.createWithDefaultWidgets).toHaveBeenCalled();
      expect(result.id).toBe('dash-1');
    });
  });
});
