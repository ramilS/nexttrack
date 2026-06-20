import { Module } from '@nestjs/common';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { VersionsRepository } from './versions.repository';

@Module({
  controllers: [VersionsController],
  providers: [VersionsService, VersionsRepository],
  exports: [VersionsService, VersionsRepository],
})
export class VersionsModule {}
