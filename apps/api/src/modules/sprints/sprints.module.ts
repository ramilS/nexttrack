import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { SprintsRepository } from './sprints.repository';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { IssuesModule } from '@/modules/issues/issues.module';
import { ProjectsModule } from '@/modules/projects/projects.module';

@Module({
  imports: [
    NotificationsModule,
    IssuesModule,
    ProjectsModule,
  ],
  controllers: [SprintsController],
  providers: [SprintsService, SprintsRepository],
  exports: [SprintsService, SprintsRepository],
})
export class SprintsModule {}
