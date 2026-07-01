import { Module } from '@nestjs/common';
import { IssuesModule } from '@/modules/issues/issues.module';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { RolesModule } from '@/modules/roles/roles.module';
import { TagsModule } from '@/modules/tags/tags.module';
import { IssueLinksModule } from '@/modules/issue-links/issue-links.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { MigrationGuard } from './migration.guard';
import { MigrationRepository } from './migration.repository';

@Module({
  imports: [
    IssuesModule,
    CustomFieldsModule,
    ProjectsModule,
    RolesModule,
    TagsModule,
    IssueLinksModule,
  ],
  controllers: [MigrationController],
  providers: [MigrationService, MigrationGuard, MigrationRepository],
})
export class MigrationModule {}
