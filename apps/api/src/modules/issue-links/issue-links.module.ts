import { Module } from '@nestjs/common';
import { IssueLinksController } from './issue-links.controller';
import { IssueLinksService } from './issue-links.service';
import { IssueLinksRepository } from './issue-links.repository';
import { ActivitiesModule } from '@/modules/activities/activities.module';

@Module({
  imports: [ActivitiesModule],
  controllers: [IssueLinksController],
  providers: [IssueLinksService, IssueLinksRepository],
  exports: [IssueLinksService],
})
export class IssueLinksModule {}
