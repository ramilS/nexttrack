import { Injectable } from '@nestjs/common';
import { OutboxRepository, OutboxEventInput } from './outbox.repository';
import { Tx } from '@/common/repository/tx.types';
import { currentRequestId } from '@/common/context/request-context';
import { captureTraceparent } from '@/common/tracing/trace-context';

export type { OutboxEventInput };

@Injectable()
export class OutboxService {
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
  }
}
