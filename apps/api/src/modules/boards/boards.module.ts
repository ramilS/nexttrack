import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardDataService } from './board-data.service';
import { BoardIssueMoveService } from './board-issue-move.service';
import { BoardAnalyticsService } from './board-analytics.service';
import { BoardsRepository } from './boards.repository';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { WorkflowsModule } from '@/modules/workflows/workflows.module';
import { IssuesModule } from '@/modules/issues/issues.module';

@Module({
  imports: [
    ActivitiesModule,
    WorkflowsModule,
    IssuesModule,
  ],
  controllers: [BoardsController],
  providers: [BoardsService, BoardDataService, BoardIssueMoveService, BoardAnalyticsService, BoardsRepository],
  exports: [BoardsService, BoardDataService, BoardIssueMoveService, BoardAnalyticsService, BoardsRepository],
})
export class BoardsModule {}
