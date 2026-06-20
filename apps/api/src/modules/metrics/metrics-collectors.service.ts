import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { DOMAIN_EVENTS_QUEUE } from '@/modules/outbox/domain-events.queue';
import { Queue } from 'bullmq';
import { Gauge } from 'prom-client';
import { MetricsService } from './metrics.service';
import { OutboxRepository } from '@/modules/outbox/outbox.repository';
import { SEARCH_INDEXING_QUEUE } from '@/modules/search/indexer/indexing-queue';

/** Narrow view of a BullMQ queue — keeps tests free of full Queue mocks. */
export type MonitoredQueue = Pick<Queue, 'name' | 'getJobCounts'>;

/** Narrow view of the outbox repository used for scrape-time counting. */
export type OutboxStatusCounter = Pick<OutboxRepository, 'countByStatus'>;

/**
 * Registers on-scrape gauges: values are computed inside prom-client
 * `collect()` callbacks each time /metrics is scraped, so no polling
 * intervals or stale state.
 */
@Injectable()
export class MetricsCollectorsService {
  private readonly logger = new Logger(MetricsCollectorsService.name);

  constructor(
    metricsService: MetricsService,
    @InjectQueue('outbox-poller') outboxPollerQueue: MonitoredQueue,
    @InjectQueue('notification-email') emailQueue: MonitoredQueue,
    @InjectQueue('notification-webhook') webhookQueue: MonitoredQueue,
    @InjectQueue('notification-telegram') telegramQueue: MonitoredQueue,
    @InjectQueue(SEARCH_INDEXING_QUEUE) searchIndexingQueue: MonitoredQueue,
    @InjectQueue(DOMAIN_EVENTS_QUEUE) domainEventsQueue: MonitoredQueue,
    @Inject(OutboxRepository)
    private readonly outboxRepository: OutboxStatusCounter,
  ) {
    const queues: MonitoredQueue[] = [
      outboxPollerQueue,
      emailQueue,
      webhookQueue,
      telegramQueue,
      searchIndexingQueue,
      domainEventsQueue,
    ];
    this.registerQueueJobsGauge(metricsService, queues);
    this.registerOutboxEventsGauge(metricsService);
  }

  private registerQueueJobsGauge(
    metricsService: MetricsService,
    queues: MonitoredQueue[],
  ): void {
    const logger = this.logger;

    new Gauge({
      name: 'bullmq_queue_jobs',
      help: 'Number of BullMQ jobs per queue and state',
      labelNames: ['queue', 'state'],
      registers: [metricsService.registry],
      async collect() {
        try {
          const countsPerQueue = await Promise.all(
            queues.map((queue) => queue.getJobCounts()),
          );
          queues.forEach((queue, index) => {
            for (const [state, count] of Object.entries(
              countsPerQueue[index],
            )) {
              this.set({ queue: queue.name, state }, count);
            }
          });
        } catch (err) {
          logger.warn(
            `bullmq_queue_jobs collection failed: ${(err as Error).message}`,
          );
        }
      },
    });
  }

  private registerOutboxEventsGauge(metricsService: MetricsService): void {
    const logger = this.logger;
    const outboxRepository = this.outboxRepository;

    new Gauge({
      name: 'outbox_events',
      help: 'Number of outbox events per status',
      labelNames: ['status'],
      registers: [metricsService.registry],
      async collect() {
        try {
          const counts = await outboxRepository.countByStatus();
          for (const [status, count] of Object.entries(counts)) {
            this.set({ status }, count);
          }
        } catch (err) {
          logger.warn(
            `outbox_events collection failed: ${(err as Error).message}`,
          );
        }
      },
    });
  }
}
