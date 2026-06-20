import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { ActivitiesRepository } from './activities.repository';

@Module({
  providers: [ActivitiesService, ActivitiesRepository],
  exports: [ActivitiesService, ActivitiesRepository],
})
export class ActivitiesModule {}
