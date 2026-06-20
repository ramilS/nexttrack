import { Module } from '@nestjs/common';
import { AutoAssignController } from './auto-assign.controller';
import { AutoAssignService } from './auto-assign.service';
import { AutoAssignRepository } from './auto-assign.repository';

@Module({
  controllers: [AutoAssignController],
  providers: [AutoAssignService, AutoAssignRepository],
  exports: [AutoAssignService],
})
export class AutoAssignModule {}
