import { OutboxStatus } from '@prisma/client';
import {
  MetricsCollectorsService,
  MonitoredQueue,
  OutboxStatusCounter,
} from './metrics-collectors.service';
import { MetricsService } from './metrics.service';

function buildQueue(
  name: string,
  counts: Record<string, number>,
): MonitoredQueue {
  return {
    name,
    getJobCounts: jest.fn().mockResolvedValue(counts),
  };
}

function buildService(overrides?: {
  outboxPollerQueue?: MonitoredQueue;
  outboxRepository?: OutboxStatusCounter;
}): { metricsService: MetricsService } {
  const metricsService = new MetricsService();

  new MetricsCollectorsService(
    metricsService,
    overrides?.outboxPollerQueue ??
      buildQueue('outbox-poller', { waiting: 3, active: 1 }),
    buildQueue('notification-email', { waiting: 0, failed: 2 }),
    buildQueue('notification-webhook', { delayed: 4 }),
    buildQueue('notification-telegram', { waiting: 0 }),
    buildQueue('search-indexing', { active: 7 }),
    buildQueue('domain-events', { waiting: 1 }),
    overrides?.outboxRepository ?? {
      countByStatus: jest.fn().mockResolvedValue({
        [OutboxStatus.PENDING]: 5,
        [OutboxStatus.PROCESSING]: 2,
        [OutboxStatus.PROCESSED]: 10,
        [OutboxStatus.FAILED]: 0,
      }),
    },
  );

  return { metricsService };
}

describe('MetricsCollectorsService', () => {
  it('reports BullMQ job counts per queue and state on scrape', async () => {
    const { metricsService } = buildService();

    const output = await metricsService.getMetrics();

    expect(output).toContain(
      'bullmq_queue_jobs{queue="outbox-poller",state="waiting"} 3',
    );
    expect(output).toContain(
      'bullmq_queue_jobs{queue="outbox-poller",state="active"} 1',
    );
    expect(output).toContain(
      'bullmq_queue_jobs{queue="notification-email",state="failed"} 2',
    );
    expect(output).toContain(
      'bullmq_queue_jobs{queue="notification-webhook",state="delayed"} 4',
    );
    expect(output).toContain(
      'bullmq_queue_jobs{queue="search-indexing",state="active"} 7',
    );
  });

  it('queries job counts on every scrape (no stale cache)', async () => {
    const pollerQueue = buildQueue('outbox-poller', { waiting: 3 });
    const { metricsService } = buildService({ outboxPollerQueue: pollerQueue });

    await metricsService.getMetrics();
    await metricsService.getMetrics();

    expect(pollerQueue.getJobCounts).toHaveBeenCalledTimes(2);
  });

  it('reports outbox event counts per status, including zero defaults', async () => {
    const { metricsService } = buildService();

    const output = await metricsService.getMetrics();

    expect(output).toContain('outbox_events{status="PENDING"} 5');
    expect(output).toContain('outbox_events{status="PROCESSING"} 2');
    expect(output).toContain('outbox_events{status="PROCESSED"} 10');
    expect(output).toContain('outbox_events{status="FAILED"} 0');
  });

  it('still scrapes when a queue is unreachable', async () => {
    const brokenQueue: MonitoredQueue = {
      name: 'outbox-poller',
      getJobCounts: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const { metricsService } = buildService({ outboxPollerQueue: brokenQueue });

    const output = await metricsService.getMetrics();

    expect(output).toContain('outbox_events{status="PENDING"} 5');
  });

  it('still scrapes when the outbox count query fails', async () => {
    const brokenRepository: OutboxStatusCounter = {
      countByStatus: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const { metricsService } = buildService({
      outboxRepository: brokenRepository,
    });

    const output = await metricsService.getMetrics();

    expect(output).toContain(
      'bullmq_queue_jobs{queue="outbox-poller",state="waiting"} 3',
    );
  });
});
