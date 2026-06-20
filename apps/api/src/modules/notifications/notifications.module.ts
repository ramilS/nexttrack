import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsDispatchService } from './notifications-dispatch.service';
import { NotificationsPreferencesService } from './notifications-preferences.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationJobsProcessor } from './notification-jobs.processor';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { RealtimeModule } from '@/modules/realtime/realtime.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    OutboxModule,
    RealtimeModule,
    UsersModule,
    BullModule.registerQueue(
      { name: 'notification-dispatch' },
      { name: 'notification-jobs' },
    ),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationsDispatchService,
    NotificationsPreferencesService,
    NotificationJobsProcessor,
  ],
  exports: [NotificationsDispatchService, NotificationsService],
})
export class NotificationsModule {}
