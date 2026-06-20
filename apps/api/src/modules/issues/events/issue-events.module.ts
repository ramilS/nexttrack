import { Module } from '@nestjs/common';
import { IssueEventsListener } from './issue-events.listener';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { SearchModule } from '@/modules/search/search.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { MentionsModule } from '@/modules/mentions/mentions.module';
import { WorkflowAutomationModule } from '@/modules/workflow-automation/workflow-automation.module';

@Module({
  imports: [
    ActivitiesModule,
    SearchModule,
    NotificationsModule,
    MentionsModule,
    WorkflowAutomationModule,
  ],
  providers: [IssueEventsListener],
})
export class IssueEventsModule {}
