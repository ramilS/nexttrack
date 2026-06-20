import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentsStorageService } from './attachments-storage.service';
import { AttachmentsRepository } from './attachments.repository';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { IssuesModule } from '@/modules/issues/issues.module';
import { ProjectsModule } from '@/modules/projects/projects.module';

@Module({
  imports: [ActivitiesModule, IssuesModule, ProjectsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsStorageService, AttachmentsRepository],
  exports: [AttachmentsService, AttachmentsStorageService],
})
export class AttachmentsModule {}
