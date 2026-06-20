import { Module } from '@nestjs/common';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { IssuesQueryService } from './issues-query.service';
import { IssueHierarchyService } from './issue-hierarchy.service';
import { IssuesRepository } from './issues.repository';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { UsersModule } from '@/modules/users/users.module';
import { WorkflowAutomationModule } from '@/modules/workflow-automation/workflow-automation.module';

@Module({
  imports: [
    CustomFieldsModule,
    ActivitiesModule,
    UsersModule,
    WorkflowAutomationModule,
    OutboxModule,
  ],
  controllers: [IssuesController],
  providers: [
    IssuesService,
    IssuesQueryService,
    IssueHierarchyService,
    IssuesRepository,
  ],
  exports: [IssuesService, IssuesQueryService, IssuesRepository],
})
export class IssuesModule {}
