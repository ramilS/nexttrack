import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { DOMAIN_EVENTS_QUEUE } from '@/modules/outbox/domain-events.queue';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsCollectorsService } from './metrics-collectors.service';
import { MetricsController } from './metrics.controller';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { SEARCH_INDEXING_QUEUE } from '@/modules/search/indexer/indexing-queue';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue(
      { name: 'outbox-poller' },
      { name: 'notification-email' },
      { name: 'notification-webhook' },
      { name: 'notification-telegram' },
      { name: SEARCH_INDEXING_QUEUE },
      { name: DOMAIN_EVENTS_QUEUE },
    ),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsCollectorsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class MetricsModule {}
