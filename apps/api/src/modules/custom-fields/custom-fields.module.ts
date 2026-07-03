import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { FieldValuesController } from './field-values.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldValuesService } from './custom-field-values.service';
import { CustomFieldValidatorService } from './custom-field-validator.service';
import { CustomFieldsRepository } from './custom-fields.repository';
import { CustomFieldValuesRepository } from './custom-field-values.repository';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { UsersModule } from '@/modules/users/users.module';
import { VersionsModule } from '@/modules/versions/versions.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { IndexerHooksModule } from '@/modules/search/indexer/indexer-hooks.module';

@Module({
  imports: [
    ActivitiesModule,
    UsersModule,
    VersionsModule,
    ProjectsModule,
    IndexerHooksModule,
  ],
  controllers: [CustomFieldsController, FieldValuesController],
  providers: [
    CustomFieldsService,
    CustomFieldValuesService,
    CustomFieldValidatorService,
    CustomFieldsRepository,
    CustomFieldValuesRepository,
  ],
  exports: [CustomFieldsService, CustomFieldValuesService, CustomFieldsRepository],
})
export class CustomFieldsModule {}
