import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { trace } from '@opentelemetry/api';
import { runWithTraceparent } from '@/common/tracing/trace-context';
import { OutboxPollerProcessor } from './outbox-poller.processor';
import { DOMAIN_EVENTS_QUEUE } from './domain-events.queue';

interface DomainEventJobData {
  outboxEventId: string;
  __traceparent?: string;
  [key: string]: unknown;
}

const tracer = trace.getTracer('outbox');

/**
 * Delivers INTERNAL outbox events to in-process @OnEvent listeners.
 * The job name is the original eventType (e.g. 'issue.updated'), so all
 * existing listeners keep working unchanged — they now just receive the
 * payload after the outbox round-trip instead of synchronously.
 */
@Processor(DOMAIN_EVENTS_QUEUE)
@Injectable()
export class DomainEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(DomainEventsProcessor.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private outboxPoller: OutboxPollerProcessor,
  ) {
    super();
  }

  async process(job: Job<DomainEventJobData>): Promise<void> {
    const { outboxEventId, __traceparent, ...payload } = job.data;

    const event = await this.outboxPoller.findEventById(outboxEventId);
    if (!event || event.status === OutboxStatus.PROCESSED) {
      this.logger.debug(
        `Domain event ${job.name} (${outboxEventId}) already processed — skipping`,
      );
      return;
    }

    // Restore the trace context captured at publish time so listener spans
    // (Prisma writes, idempotency claims) nest under the originating request
    // trace. `startActiveSpan` binds the span to the active context — required
    // for that nesting; plain `startSpan` would not.
    await runWithTraceparent(__traceparent, () =>
      tracer.startActiveSpan(`domain-event ${job.name}`, async (span) => {
        try {
          await this.eventEmitter.emitAsync(job.name, {
            ...payload,
            eventId: outboxEventId,
          });
          await this.outboxPoller.markProcessed(outboxEventId);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          span.recordException(error);
          this.logger.error(
            `Domain event ${job.name} (${outboxEventId}) listener failed: ${error.message}`,
            error.stack,
          );
          await this.outboxPoller.markFailed(
            outboxEventId,
            event.attempts,
            event.maxAttempts,
            error.message,
          );
          throw error;
        } finally {
          span.end();
        }
      }),
    );
  }
}
