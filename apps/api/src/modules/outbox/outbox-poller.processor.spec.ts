import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeliveryChannel } from '@prisma/client';
import { OutboxPollerProcessor } from './outbox-poller.processor';
import {
  OutboxRepository,
  ClaimedOutboxEvent,
} from './outbox.repository';
import { outboxConfig } from '@/config/outbox.config';
import { appConfig } from '@/config/app.config';

type RepoMock = jest.Mocked<
  Pick<
    OutboxRepository,
    'recoverStaleProcessing' | 'claimPendingBatch' | 'markFailedWithBackoff'
  >
>;

// The processor only awaits `queue.add` for its side effect; it never reads the
// returned Job. Typing `add` as resolving `void` lets mocks resolve `undefined`.
interface QueueMock {
  add: jest.Mock<Promise<void>, Parameters<Queue['add']>>;
}

const BATCH_SIZE = 100;
const STALE_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 5000;

function buildClaimedEvent(
  overrides: Partial<ClaimedOutboxEvent> = {},
): ClaimedOutboxEvent {
  return {
    id: 'outbox-1',
    channel: DeliveryChannel.EMAIL,
    eventType: 'ISSUE_CREATED',
    payload: { title: 'Test issue' },
    attempts: 0,
    maxAttempts: 5,
    traceparent: null,
    ...overrides,
  };
}

describe('OutboxPollerProcessor', () => {
  let processor: OutboxPollerProcessor;
  let repo: RepoMock;
  let pollerQueue: QueueMock;
  let emailQueue: QueueMock;
  let webhookQueue: QueueMock;
  let telegramQueue: QueueMock;
  let domainEventsQueue: QueueMock;

  const buildQueueMock = (): QueueMock => ({
    add: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    repo = {
      recoverStaleProcessing: jest.fn().mockResolvedValue(undefined),
      claimPendingBatch: jest.fn().mockResolvedValue([]),
      markFailedWithBackoff: jest.fn().mockResolvedValue(undefined),
    };

    pollerQueue = buildQueueMock();
    emailQueue = buildQueueMock();
    webhookQueue = buildQueueMock();
    telegramQueue = buildQueueMock();
    domainEventsQueue = buildQueueMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxPollerProcessor,
        { provide: OutboxRepository, useValue: repo },
        {
          provide: outboxConfig.KEY,
          useValue: {
            pollIntervalMs: POLL_INTERVAL_MS,
            batchSize: BATCH_SIZE,
            staleTimeoutMs: STALE_TIMEOUT_MS,
          },
        },
        { provide: appConfig.KEY, useValue: { nodeEnv: 'test' } },
        { provide: getQueueToken('outbox-poller'), useValue: pollerQueue },
        { provide: getQueueToken('notification-email'), useValue: emailQueue },
        {
          provide: getQueueToken('notification-webhook'),
          useValue: webhookQueue,
        },
        {
          provide: getQueueToken('notification-telegram'),
          useValue: telegramQueue,
        },
        {
          provide: getQueueToken('domain-events'),
          useValue: domainEventsQueue,
        },
      ],
    }).compile();

    processor = module.get<OutboxPollerProcessor>(OutboxPollerProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('pollOnce', () => {
    it('recovers stale PROCESSING events before claiming a batch', async () => {
      await processor.pollOnce();

      expect(repo.recoverStaleProcessing).toHaveBeenCalledTimes(1);
      const [now, staleThreshold] =
        repo.recoverStaleProcessing.mock.calls[0];
      expect(now).toBeInstanceOf(Date);
      expect(staleThreshold).toBeInstanceOf(Date);
      // staleThreshold is `now - staleTimeoutMs`.
      expect((now as Date).getTime() - (staleThreshold as Date).getTime()).toBe(
        STALE_TIMEOUT_MS,
      );
    });

    it('recovers stale events before claiming (invocation order)', async () => {
      const order: string[] = [];
      repo.recoverStaleProcessing.mockImplementation(async () => {
        order.push('recover');
      });
      repo.claimPendingBatch.mockImplementation(async () => {
        order.push('claim');
        return [];
      });

      await processor.pollOnce();

      expect(order).toEqual(['recover', 'claim']);
    });

    it('claims a batch using the configured batchSize', async () => {
      await processor.pollOnce();

      expect(repo.claimPendingBatch).toHaveBeenCalledTimes(1);
      const [now, batchSize] = repo.claimPendingBatch.mock.calls[0];
      expect(now).toBeInstanceOf(Date);
      expect(batchSize).toBe(BATCH_SIZE);
    });

    it('returns 0 and enqueues nothing when the claim is empty', async () => {
      repo.claimPendingBatch.mockResolvedValue([]);

      const result = await processor.pollOnce();

      expect(result).toBe(0);
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(webhookQueue.add).not.toHaveBeenCalled();
      expect(telegramQueue.add).not.toHaveBeenCalled();
      expect(repo.markFailedWithBackoff).not.toHaveBeenCalled();
    });

    it('returns the number of claimed events', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'a' }),
        buildClaimedEvent({ id: 'b' }),
      ]);

      const result = await processor.pollOnce();

      expect(result).toBe(2);
    });

    it('routes EMAIL events to the email queue only', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'email-1', channel: DeliveryChannel.EMAIL }),
      ]);

      await processor.pollOnce();

      expect(emailQueue.add).toHaveBeenCalledTimes(1);
      expect(webhookQueue.add).not.toHaveBeenCalled();
      expect(telegramQueue.add).not.toHaveBeenCalled();
    });

    it('routes WEBHOOK events to the webhook queue only', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'wh-1', channel: DeliveryChannel.WEBHOOK }),
      ]);

      await processor.pollOnce();

      expect(webhookQueue.add).toHaveBeenCalledTimes(1);
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(telegramQueue.add).not.toHaveBeenCalled();
    });

    it('routes TELEGRAM events to the telegram queue only', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'tg-1', channel: DeliveryChannel.TELEGRAM }),
      ]);

      await processor.pollOnce();

      expect(telegramQueue.add).toHaveBeenCalledTimes(1);
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(webhookQueue.add).not.toHaveBeenCalled();
    });

    it('routes a mixed batch to all three channel queues', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'email-1', channel: DeliveryChannel.EMAIL }),
        buildClaimedEvent({ id: 'wh-1', channel: DeliveryChannel.WEBHOOK }),
        buildClaimedEvent({ id: 'tg-1', channel: DeliveryChannel.TELEGRAM }),
      ]);

      const result = await processor.pollOnce();

      expect(result).toBe(3);
      expect(emailQueue.add).toHaveBeenCalledTimes(1);
      expect(webhookQueue.add).toHaveBeenCalledTimes(1);
      expect(telegramQueue.add).toHaveBeenCalledTimes(1);
      expect(repo.markFailedWithBackoff).not.toHaveBeenCalled();
    });

    it('derives the jobId from the event id and attempt so retries are not deduplicated away', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'outbox-42', channel: DeliveryChannel.EMAIL, attempts: 2 }),
      ]);

      await processor.pollOnce();

      const [, , options] = emailQueue.add.mock.calls[0];
      expect(options).toMatchObject({ jobId: 'outbox-42#2' });
    });

    it('enqueues with eventType as job name and merges payload with outboxEventId', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({
          id: 'outbox-7',
          channel: DeliveryChannel.EMAIL,
          eventType: 'ISSUE_ASSIGNED',
          payload: { title: 'Hello', recipientId: 'user-1' },
        }),
      ]);

      await processor.pollOnce();

      const [jobName, jobData] = emailQueue.add.mock.calls[0];
      expect(jobName).toBe('ISSUE_ASSIGNED');
      expect(jobData).toEqual({
        outboxEventId: 'outbox-7',
        title: 'Hello',
        recipientId: 'user-1',
      });
    });

    it('forwards traceparent to the channel queue as __traceparent', async () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({
          id: 'evt-1',
          channel: DeliveryChannel.INTERNAL,
          eventType: 'issue.created',
          payload: { foo: 'bar' },
          traceparent: tp,
        }),
      ]);

      await processor.pollOnce();

      const [jobName, jobData] = domainEventsQueue.add.mock.calls[0];
      expect(jobName).toBe('issue.created');
      expect(jobData).toEqual({
        outboxEventId: 'evt-1',
        __traceparent: tp,
        foo: 'bar',
      });
    });

    it('omits __traceparent when the event has none', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({
          id: 'evt-2',
          channel: DeliveryChannel.INTERNAL,
          eventType: 'issue.created',
          payload: { foo: 'bar' },
          traceparent: null,
        }),
      ]);

      await processor.pollOnce();

      const [, jobData] = domainEventsQueue.add.mock.calls[0];
      expect(jobData).not.toHaveProperty('__traceparent');
    });

    it('handles a null payload without throwing', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({
          id: 'outbox-null',
          channel: DeliveryChannel.EMAIL,
          payload: null,
        }),
      ]);

      const result = await processor.pollOnce();

      expect(result).toBe(1);
      const [, jobData] = emailQueue.add.mock.calls[0];
      expect(jobData).toMatchObject({ outboxEventId: 'outbox-null' });
      expect(repo.markFailedWithBackoff).not.toHaveBeenCalled();
    });

    describe('per-event failure isolation', () => {
      it('marks the failing event failed but still dispatches the others', async () => {
        repo.claimPendingBatch.mockResolvedValue([
          buildClaimedEvent({ id: 'ok-before', channel: DeliveryChannel.EMAIL }),
          buildClaimedEvent({
            id: 'bad',
            channel: DeliveryChannel.WEBHOOK,
            attempts: 2,
            maxAttempts: 5,
          }),
          buildClaimedEvent({ id: 'ok-after', channel: DeliveryChannel.TELEGRAM }),
        ]);
        webhookQueue.add.mockRejectedValue(new Error('queue down'));

        const result = await processor.pollOnce();

        // The whole batch is still considered claimed.
        expect(result).toBe(3);
        // Good events on other channels were dispatched.
        expect(emailQueue.add).toHaveBeenCalledTimes(1);
        expect(telegramQueue.add).toHaveBeenCalledTimes(1);
        // Bad event was marked failed with its attempts/maxAttempts.
        expect(repo.markFailedWithBackoff).toHaveBeenCalledTimes(1);
        expect(repo.markFailedWithBackoff).toHaveBeenCalledWith(
          'bad',
          2,
          5,
          expect.stringContaining('queue down'),
        );
      });

      it('isolates failures per event even on the same channel', async () => {
        repo.claimPendingBatch.mockResolvedValue([
          buildClaimedEvent({ id: 'email-bad', channel: DeliveryChannel.EMAIL }),
          buildClaimedEvent({ id: 'email-ok', channel: DeliveryChannel.EMAIL }),
        ]);
        emailQueue.add
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValueOnce(undefined);

        const result = await processor.pollOnce();

        expect(result).toBe(2);
        expect(emailQueue.add).toHaveBeenCalledTimes(2);
        expect(repo.markFailedWithBackoff).toHaveBeenCalledTimes(1);
        expect(repo.markFailedWithBackoff).toHaveBeenCalledWith(
          'email-bad',
          0,
          5,
          expect.stringContaining('transient'),
        );
      });

      it('does not mark events failed when all enqueues succeed', async () => {
        repo.claimPendingBatch.mockResolvedValue([
          buildClaimedEvent({ id: 'a', channel: DeliveryChannel.EMAIL }),
          buildClaimedEvent({ id: 'b', channel: DeliveryChannel.WEBHOOK }),
        ]);

        await processor.pollOnce();

        expect(repo.markFailedWithBackoff).not.toHaveBeenCalled();
      });
    });
  });

  describe('process', () => {
    it('delegates to pollOnce', async () => {
      repo.claimPendingBatch.mockResolvedValue([
        buildClaimedEvent({ id: 'p-1', channel: DeliveryChannel.EMAIL }),
      ]);

      await processor.process();

      expect(repo.recoverStaleProcessing).toHaveBeenCalledTimes(1);
      expect(repo.claimPendingBatch).toHaveBeenCalledTimes(1);
      expect(emailQueue.add).toHaveBeenCalledTimes(1);
    });
  });
});
