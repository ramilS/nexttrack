import { Injectable } from '@nestjs/common';
import { Prisma, WidgetType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';

export interface DashboardRow {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  layout: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidgetRow {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: Prisma.JsonValue;
}

export interface DashboardWithWidgetsRow extends DashboardRow {
  widgets: DashboardWidgetRow[];
}

export interface CreateDashboardInput {
  userId: string;
  name: string;
  isDefault: boolean;
}

export interface UpdateDashboardPatch {
  name?: string;
  layout?: unknown;
  isDefault?: boolean;
}

export interface CreateWidgetInput {
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: unknown;
}

export interface UpdateWidgetPatch {
  title?: string;
  config?: unknown;
}

export interface DefaultWidgetSeed {
  type: WidgetType;
  title: string;
}

export interface DashboardWidgetWithOwnerRow extends DashboardWidgetRow {
  ownerUserId: string;
}

@Injectable()
export class DashboardsRepository {
  constructor(private prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  // ─── Dashboard CRUD ─────────────────────────────────────────

  async findAllByUser(userId: string): Promise<DashboardWithWidgetsRow[]> {
    return this.prisma.dashboard.findMany({
      where: { userId },
      include: { widgets: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findWithWidgets(
    dashboardId: string,
  ): Promise<DashboardWithWidgetsRow | null> {
    return this.prisma.dashboard.findFirst({
      where: { id: dashboardId },
      include: { widgets: true },
    });
  }

  async findDefaultForUserWithWidgets(
    userId: string,
  ): Promise<DashboardWithWidgetsRow | null> {
    return this.prisma.dashboard.findFirst({
      where: { userId, isDefault: true },
      include: { widgets: true },
    });
  }

  async unsetDefaultForUser(
    userId: string,
    exceptDashboardId?: string,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).dashboard.updateMany({
      where: {
        userId,
        isDefault: true,
        ...(exceptDashboardId ? { id: { not: exceptDashboardId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async create(input: CreateDashboardInput): Promise<DashboardWithWidgetsRow> {
    return this.prisma.dashboard.create({
      data: {
        userId: input.userId,
        name: input.name,
        isDefault: input.isDefault,
        layout: asJson([]),
      },
      include: { widgets: true },
    });
  }

  async update(
    dashboardId: string,
    patch: UpdateDashboardPatch,
  ): Promise<DashboardWithWidgetsRow> {
    return this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.layout !== undefined && { layout: asJson(patch.layout) }),
        ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }),
      },
      include: { widgets: true },
    });
  }

  async delete(dashboardId: string): Promise<void> {
    await this.prisma.dashboard.delete({ where: { id: dashboardId } });
  }

  async createWithDefaultWidgets(
    userId: string,
    name: string,
    widgets: DefaultWidgetSeed[],
    buildLayout: (
      widgets: DashboardWidgetRow[],
    ) => unknown,
  ): Promise<DashboardWithWidgetsRow> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.dashboard.create({
        data: {
          userId,
          name,
          isDefault: true,
          layout: asJson([]),
          widgets: {
            create: widgets.map((w) => ({
              type: w.type,
              title: w.title,
              config: asJson({}),
            })),
          },
        },
        include: { widgets: true },
      });

      const layout = buildLayout(created.widgets);

      return tx.dashboard.update({
        where: { id: created.id },
        data: { layout: asJson(layout) },
        include: { widgets: true },
      });
    });
  }

  // ─── Widget CRUD ────────────────────────────────────────────

  async findWidgetWithDashboardOwner(
    widgetId: string,
  ): Promise<DashboardWidgetWithOwnerRow | null> {
    const row = await this.prisma.dashboardWidget.findFirst({
      where: { id: widgetId },
      include: { dashboard: { select: { userId: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      dashboardId: row.dashboardId,
      type: row.type,
      title: row.title,
      config: row.config,
      ownerUserId: row.dashboard.userId,
    };
  }

  async findWidgetInDashboard(
    dashboardId: string,
    widgetId: string,
  ): Promise<DashboardWidgetRow | null> {
    return this.prisma.dashboardWidget.findFirst({
      where: { id: widgetId, dashboardId },
    });
  }

  async createWidget(input: CreateWidgetInput): Promise<DashboardWidgetRow> {
    return this.prisma.dashboardWidget.create({
      data: {
        dashboardId: input.dashboardId,
        type: input.type,
        title: input.title,
        config: asJson(input.config),
      },
    });
  }

  async updateWidget(
    widgetId: string,
    patch: UpdateWidgetPatch,
  ): Promise<DashboardWidgetRow> {
    return this.prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.config !== undefined && { config: asJson(patch.config) }),
      },
    });
  }

  async deleteWidget(widgetId: string): Promise<void> {
    await this.prisma.dashboardWidget.delete({ where: { id: widgetId } });
  }

}
