import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DeliveryChannel } from '@prisma/client';
import { outboxConfig, appConfig } from '@/config';
import { OutboxRepository, OutboxEventAttempts } from './outbox.repository';
import { DOMAIN_EVENTS_QUEUE } from './domain-events.queue';
import { AppLogger } from '@/common/logging/app-logger';

const POLL_REPEAT_KEY = 'outbox-poll-recurring';

@Processor('outbox-poller')
@Injectable()
export class OutboxPollerProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new AppLogger(OutboxPollerProcessor.name);

  constructor(
    private repo: OutboxRepository,
    @Inject(outboxConfig.KEY)
    private config: ConfigType<typeof outboxConfig>,
    @Inject(appConfig.KEY)
    private app: ConfigType<typeof appConfig>,
    @InjectQueue('outbox-poller') private pollerQueue: Queue,
    @InjectQueue('notification-email') private emailQueue: Queue,
    @InjectQueue('notification-webhook') private webhookQueue: Queue,
    @InjectQueue('notification-telegram') private telegramQueue: Queue,
    @InjectQueue(DOMAIN_EVENTS_QUEUE) private domainEventsQueue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    const enabled = this.config.pollerEnabled ?? this.app.nodeEnv !== 'test';
    if (!enabled) return;

    // Drop any prior repeatable to avoid duplicates after config changes.
    const repeatables = await this.pollerQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === 'poll') {
        await this.pollerQueue.removeRepeatableByKey(r.key);
      }
    }

    await this.pollerQueue.add(
      'poll',
      {},
      {
        repeat: { every: this.config.pollIntervalMs },
        jobId: POLL_REPEAT_KEY,
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 5 },
      },
    );

    this.logger.log('Outbox poller scheduled', {
      pollIntervalMs: this.config.pollIntervalMs,
    });
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down outbox queues...');
    await Promise.allSettled([
      this.pollerQueue.close(),
      this.emailQueue.close(),
      this.webhookQueue.close(),
      this.telegramQueue.close(),
      this.domainEventsQueue.close(),
    ]);
    this.logger.log('Outbox queues closed');
  }

  async process() {
    const claimed = await this.pollOnce();
    if (claimed > 0) {
      this.logger.debug('Outbox poll claimed events', { claimed });
    }
  }

  /**
   * Atomically claim a batch of PENDING events and dispatch them to the
   * channel-specific queue. The atomic claim itself lives in the repository.
   *
   * Public for integration tests.
   */
  async pollOnce(): Promise<number> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - this.config.staleTimeoutMs);

    await this.repo.recoverStaleProcessing(now, staleThreshold);

    const claimed = await this.repo.claimPendingBatch(
      now,
      this.config.batchSize,
    );

    if (claimed.length === 0) return 0;

    // Hand each claimed event to its channel queue. The jobId includes the
    // attempt number: replays of the same claim collapse into one job, but a
    // retry (attempts+1) gets a fresh id — BullMQ silently ignores add() for
    // an id that still exists in the completed/failed sets, so a constant id
    // would block outbox-level retries entirely.
    for (const event of claimed) {
      try {
        const queue = this.getQueue(event.channel);
        await queue.add(
          event.eventType,
          {
            outboxEventId: event.id,
            ...(event.traceparent ? { __traceparent: event.traceparent } : {}),
            ...(event.payload as object),
          },
          {
            jobId: `${event.id}#${event.attempts}`,
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
          },
        );
        this.logger.debug('Outbox event routed', {
          eventId: event.id,
          eventType: event.eventType,
          channel: event.channel,
          attempt: event.attempts,
        });
      } catch (error) {
        this.logger.error('Failed to enqueue outbox event', error, {
          eventId: event.id,
          eventType: event.eventType,
          channel: event.channel,
          attempt: event.attempts,
        });
        await this.markFailed(
          event.id,
          event.attempts,
          event.maxAttempts,
          String(error),
        );
      }
    }

    return claimed.length;
  }

  async markProcessed(outboxEventId: string): Promise<void> {
    await this.repo.markProcessed(outboxEventId);
  }

  async findEventById(
    outboxEventId: string,
  ): Promise<OutboxEventAttempts | null> {
    return this.repo.findAttemptsById(outboxEventId);
  }

  async rescheduleFor(
    outboxEventId: string,
    nextRetryAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.repo.rescheduleAt(outboxEventId, nextRetryAt, lastError);
  }

  async markFailed(
    outboxEventId: string,
    currentAttempts: number,
    maxAttempts: number,
    error: string,
  ): Promise<void> {
    await this.repo.markFailedWithBackoff(
      outboxEventId,
      currentAttempts,
      maxAttempts,
      error,
    );
  }

  private getQueue(channel: DeliveryChannel): Queue {
    switch (channel) {
      case DeliveryChannel.EMAIL:
        return this.emailQueue;
      case DeliveryChannel.WEBHOOK:
        return this.webhookQueue;
      case DeliveryChannel.TELEGRAM:
        return this.telegramQueue;
      case DeliveryChannel.INTERNAL:
        return this.domainEventsQueue;
    }
  }
}
