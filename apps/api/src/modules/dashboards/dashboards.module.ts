import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { WidgetDataService } from './widget-data.service';
import { DashboardsRepository } from './dashboards.repository';
import { DashboardReportingRepository } from './dashboard-reporting.repository';

@Module({
  controllers: [DashboardsController],
  providers: [
    DashboardsService,
    WidgetDataService,
    DashboardsRepository,
    DashboardReportingRepository,
  ],
  exports: [DashboardsService],
})
export class DashboardsModule {}
