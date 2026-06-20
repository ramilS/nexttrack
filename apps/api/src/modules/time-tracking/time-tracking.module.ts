import { Module } from '@nestjs/common';
import { TimeLogsController } from './time-logs.controller';
import { TimerController } from './timer.controller';
import { TimeReportsController } from './time-reports.controller';
import { UserTimeReportController } from './user-time-report.controller';
import { TimeLogsService } from './time-logs.service';
import { ActiveTimerService } from './active-timer.service';
import { TimeReportsService } from './time-reports.service';
import { TimeLogsRepository } from './time-logs.repository';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { IssuesModule } from '@/modules/issues/issues.module';
import { ProjectsModule } from '@/modules/projects/projects.module';

@Module({
  imports: [ActivitiesModule, IssuesModule, ProjectsModule],
  controllers: [
    TimeLogsController,
    TimerController,
    TimeReportsController,
    UserTimeReportController,
  ],
  providers: [TimeLogsService, ActiveTimerService, TimeReportsService, TimeLogsRepository],
  exports: [TimeLogsService],
})
export class TimeTrackingModule {}
