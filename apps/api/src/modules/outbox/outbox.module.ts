import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboxService } from './outbox.service';
import { OutboxPollerProcessor } from './outbox-poller.processor';
import { OutboxRepository } from './outbox.repository';
import { DomainEventPublisher } from './domain-event-publisher';
import { DomainEventsProcessor } from './domain-events.processor';
import { DOMAIN_EVENTS_QUEUE } from './domain-events.queue';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'outbox-poller' },
      { name: 'notification-email' },
      { name: 'notification-webhook' },
      { name: 'notification-telegram' },
      { name: DOMAIN_EVENTS_QUEUE },
    ),
  ],
  providers: [
    OutboxService,
    OutboxPollerProcessor,
    OutboxRepository,
    DomainEventPublisher,
    DomainEventsProcessor,
  ],
  exports: [
    OutboxService,
    OutboxPollerProcessor,
    OutboxRepository,
    DomainEventPublisher,
  ],
})
export class OutboxModule {}
