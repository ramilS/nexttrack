import { Module } from '@nestjs/common';
import { IssuesModule } from '@/modules/issues/issues.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { MigrationGuard } from './migration.guard';
import { MigrationRepository } from './migration.repository';

@Module({
  imports: [IssuesModule],
  controllers: [MigrationController],
  providers: [MigrationService, MigrationGuard, MigrationRepository],
})
export class MigrationModule {}
