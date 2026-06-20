import { Injectable } from '@nestjs/common';
import { DeliveryChannel } from '@prisma/client';
import { Tx } from '@/common/repository/tx.types';
import { OutboxService } from './outbox.service';

export interface DomainEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Delivery metadata merged into every payload by the domain-events processor
 * (and the test harness pump). `eventId` is the outbox row id — listeners use
 * it as the idempotency-key prefix for their side effects.
 */
export interface DomainEventMeta {
  eventId: string;
}

/**
 * Single write path for domain events. Persists the event to the outbox in
 * the SAME transaction as the aggregate mutation, so a crash between commit
 * and side effects can no longer lose the event (the in-memory
 * EventEmitter2 path did). The poller routes INTERNAL events to the
 * `domain-events` queue, whose processor re-emits them to the existing
 * @OnEvent listeners.
 *
 * Delivery is at-least-once: a failed listener flips the row back to
 * PENDING with backoff, so listeners must be idempotent (see
 * EventIdempotencyService). Known trade-offs: side effects are eventually
 * consistent (next poller tick), and ordering across concurrently processed
 * events of the same aggregate is not guaranteed.
 */
@Injectable()
export class DomainEventPublisher {
  constructor(private outboxService: OutboxService) {}

  async publish(event: DomainEventInput, tx: Tx): Promise<void> {
    await this.outboxService.createOutboxEvents(tx, [
      {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        channel: DeliveryChannel.INTERNAL,
        payload: event.payload,
      },
    ]);
  }
}
