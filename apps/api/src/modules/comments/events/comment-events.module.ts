import { Module } from '@nestjs/common';
import { CommentEventsListener } from './comment-events.listener';
import { ActivitiesModule } from '@/modules/activities/activities.module';
import { SearchModule } from '@/modules/search/search.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { MentionsModule } from '@/modules/mentions/mentions.module';

@Module({
  imports: [ActivitiesModule, SearchModule, NotificationsModule, MentionsModule],
  providers: [CommentEventsListener],
})
export class CommentEventsModule {}
