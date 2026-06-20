import { Module } from '@nestjs/common';
import { TagEventsListener } from './tag-events.listener';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { SearchModule } from '@/modules/search/search.module';

@Module({
  imports: [ActivitiesModule, SearchModule],
  providers: [TagEventsListener],
})
export class TagEventsModule {}
