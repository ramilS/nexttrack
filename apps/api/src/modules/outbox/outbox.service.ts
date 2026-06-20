import { Injectable } from '@nestjs/common';
import { OutboxRepository, OutboxEventInput } from './outbox.repository';
import { Tx } from '@/common/repository/tx.types';
import { currentRequestId } from '@/common/context/request-context';
import { captureTraceparent } from '@/common/tracing/trace-context';
import { AppLogger } from '@/common/logging/app-logger';

export type { OutboxEventInput };

@Injectable()
export class OutboxService {
  private readonly logger = new AppLogger(OutboxService.name);

  constructor(private outboxRepo: OutboxRepository) {}

  async createOutboxEvents(tx: Tx | undefined, events: OutboxEventInput[]): Promise<void> {
    const requestId = currentRequestId();
    const traceparent = captureTraceparent();
    const enriched = events.map((e) => ({
      ...e,
      traceparent,
      ...(requestId ? { payload: { requestId, ...e.payload } } : {}),
    }));
    await this.outboxRepo.createOutboxEvents(enriched, tx);

    this.logger.log('Outbox events enqueued', {
      count: enriched.length,
      eventTypes: events.map((e) => e.eventType),
    });
  }
}
