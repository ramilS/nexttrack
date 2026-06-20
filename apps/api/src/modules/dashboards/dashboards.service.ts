import { Injectable } from '@nestjs/common';
import { NotFoundError, PermissionDeniedError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { WidgetType } from '@prisma/client';
import type {
  AddWidgetParsed,
  CreateDashboardParsed,
  Dashboard,
  DashboardWidget,
  UpdateDashboardInput,
  UpdateWidgetInput,
  WidgetLayoutItem,
} from '@repo/shared/schemas';
import {
  DashboardsRepository,
  DashboardWidgetRow,
  DashboardWithWidgetsRow,
} from './dashboards.repository';

const DEFAULT_WIDGETS: { type: WidgetType; title: string }[] = [
  { type: WidgetType.MY_ISSUES, title: 'My Issues' },
  { type: WidgetType.RECENT_ACTIVITY, title: 'Recent Activity' },
  { type: WidgetType.PROJECT_PROGRESS, title: 'Project Progress' },
];

function toDashboardWidget(widget: DashboardWidgetRow): DashboardWidget {
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    config: (widget.config as Record<string, unknown> | null) ?? {},
  };
}

function getLayout(layout: unknown): WidgetLayoutItem[] {
  return Array.isArray(layout) ? (layout as WidgetLayoutItem[]) : [];
}

function toDashboard(dashboard: DashboardWithWidgetsRow): Dashboard {
  return {
    id: dashboard.id,
    userId: dashboard.userId,
    name: dashboard.name,
    isDefault: dashboard.isDefault,
    layout: getLayout(dashboard.layout),
    widgets: dashboard.widgets.map(toDashboardWidget),
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString(),
  };
}

@Injectable()
export class DashboardsService {
  constructor(private repo: DashboardsRepository) {}

  async findAll(userId: string): Promise<Dashboard[]> {
    const rows = await this.repo.findAllByUser(userId);
    return rows.map(toDashboard);
  }

  async findOne(userId: string, dashboardId: string): Promise<Dashboard> {
    const dashboard = await this.loadOwnedDashboard(userId, dashboardId);
    return toDashboard(dashboard);
  }

  async create(userId: string, dto: CreateDashboardParsed): Promise<Dashboard> {
    if (dto.isDefault) {
      await this.repo.unsetDefaultForUser(userId);
    }

    const dashboard = await this.repo.create({
      userId,
      name: dto.name,
      isDefault: dto.isDefault,
    });
    return toDashboard(dashboard);
  }

  async update(
    userId: string,
    dashboardId: string,
    dto: UpdateDashboardInput,
  ): Promise<Dashboard> {
    await this.loadOwnedDashboard(userId, dashboardId);

    if (dto.isDefault === true) {
      await this.repo.unsetDefaultForUser(userId, dashboardId);
    }

    const dashboard = await this.repo.update(dashboardId, {
      name: dto.name,
      layout: dto.layout,
      isDefault: dto.isDefault,
    });
    return toDashboard(dashboard);
  }

  async remove(userId: string, dashboardId: string): Promise<void> {
    await this.loadOwnedDashboard(userId, dashboardId);
    await this.repo.delete(dashboardId);
  }

  async addWidget(
    userId: string,
    dashboardId: string,
    dto: AddWidgetParsed,
  ): Promise<DashboardWidget> {
    await this.loadOwnedDashboard(userId, dashboardId);

    const widget = await this.repo.createWidget({
      dashboardId,
      type: dto.type,
      title: dto.title,
      config: dto.config,
    });
    return toDashboardWidget(widget);
  }

  async updateWidget(
    userId: string,
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetInput,
  ): Promise<DashboardWidget> {
    await this.loadOwnedDashboard(userId, dashboardId);
    await this.assertWidgetExists(dashboardId, widgetId);

    const widget = await this.repo.updateWidget(widgetId, {
      title: dto.title,
      config: dto.config,
    });
    return toDashboardWidget(widget);
  }

  async removeWidget(
    userId: string,
    dashboardId: string,
    widgetId: string,
  ): Promise<void> {
    await this.loadOwnedDashboard(userId, dashboardId);
    await this.assertWidgetExists(dashboardId, widgetId);
    await this.repo.deleteWidget(widgetId);
  }

  async getOrCreateDefault(userId: string): Promise<Dashboard> {
    const existing = await this.repo.findDefaultForUserWithWidgets(userId);
    if (existing) return toDashboard(existing);

    const dashboard = await this.repo.createWithDefaultWidgets(
      userId,
      'My Dashboard',
      DEFAULT_WIDGETS,
      (widgets) =>
        widgets.map((w, i) => ({
          widgetId: w.id,
          x: 0,
          y: i * 4,
          w: i === 2 ? 4 : 8,
          h: 4,
        })),
    );
    return toDashboard(dashboard);
  }

  // ─── Private ─────────────────────────────────────────────

  private async loadOwnedDashboard(
    userId: string,
    dashboardId: string,
  ): Promise<DashboardWithWidgetsRow> {
    const dashboard = await this.repo.findWithWidgets(dashboardId);

    if (!dashboard) {
      throw new NotFoundError(ErrorCode.DASHBOARD_NOT_FOUND, 'Dashboard not found');
    }

    if (dashboard.userId !== userId) {
      throw new PermissionDeniedError(
        ErrorCode.DASHBOARD_NOT_OWNER,
        'You do not own this dashboard',
      );
    }

    return dashboard;
  }

  private async assertWidgetExists(dashboardId: string, widgetId: string) {
    const widget = await this.repo.findWidgetInDashboard(dashboardId, widgetId);
    if (!widget) {
      throw new NotFoundError(ErrorCode.DASHBOARD_WIDGET_NOT_FOUND, 'Widget not found');
    }
  }
}
