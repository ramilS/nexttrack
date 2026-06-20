import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryChannel, OutboxStatus, Prisma } from '@prisma/client';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OutboxService, OutboxEventInput } from './outbox.service';
import { OutboxRepository } from './outbox.repository';
import { PrismaService } from '@/prisma/prisma.service';
import { runWithRequestId } from '@/common/context/request-context';

interface MockTx {
  outboxEvent: {
    createMany: jest.Mock;
  };
}

describe('OutboxService', () => {
  let service: OutboxService;
  let tracerProvider: BasicTracerProvider;
  let contextManager: AsyncHooksContextManager;

  beforeAll(() => {
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    trace.setGlobalTracerProvider(tracerProvider);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(async () => {
    contextManager.disable();
    await tracerProvider.shutdown();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        OutboxRepository,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOutboxEvents', () => {
    let tx: MockTx;
    let txClient: Prisma.TransactionClient;

    beforeEach(() => {
      tx = {
        outboxEvent: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      txClient = tx as unknown as Prisma.TransactionClient;
    });

    it('should return early when events array is empty', async () => {
      await service.createOutboxEvents(txClient, []);

      expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
    });

    it('should create outbox events with correct data', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: { title: 'Test issue' },
        },
      ];

      await service.createOutboxEvents(txClient, events);

      expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data).toHaveLength(1);
      expect(callArgs.data[0]).toMatchObject({
        aggregateType: 'Issue',
        aggregateId: 'issue-1',
        eventType: 'ISSUE_CREATED',
        channel: DeliveryChannel.EMAIL,
        payload: { title: 'Test issue' },
        status: OutboxStatus.PENDING,
        maxAttempts: 5,
      });
      expect(callArgs.data[0].nextRetryAt).toBeInstanceOf(Date);
    });

    it('should use default maxAttempts of 5 when not provided', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: {},
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].maxAttempts).toBe(5);
    });

    it('should use custom maxAttempts when provided', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: {},
          maxAttempts: 10,
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].maxAttempts).toBe(10);
    });

    it('should handle multiple events in a single call', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: { title: 'First' },
        },
        {
          aggregateType: 'Comment',
          aggregateId: 'comment-1',
          eventType: 'COMMENT_ADDED',
          channel: DeliveryChannel.EMAIL,
          payload: { body: 'Second' },
          maxAttempts: 3,
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data).toHaveLength(2);
      expect(callArgs.data[0].aggregateType).toBe('Issue');
      expect(callArgs.data[0].maxAttempts).toBe(5);
      expect(callArgs.data[1].aggregateType).toBe('Comment');
      expect(callArgs.data[1].maxAttempts).toBe(3);
    });

    it('should set nextRetryAt to approximately the current time', async () => {
      const before = new Date();

      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: {},
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const after = new Date();
      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      const nextRetryAt = callArgs.data[0].nextRetryAt as Date;

      expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(nextRetryAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should stamp the current request id into event payloads', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: { title: 'Test issue' },
        },
      ];

      await runWithRequestId('req-42', () =>
        service.createOutboxEvents(txClient, events),
      );

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].payload).toMatchObject({
        requestId: 'req-42',
        title: 'Test issue',
      });
    });

    it('should not let the request id override an explicit payload key', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: { requestId: 'explicit' },
        },
      ];

      await runWithRequestId('ambient', () =>
        service.createOutboxEvents(txClient, events),
      );

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].payload.requestId).toBe('explicit');
    });

    it('should leave payloads untouched outside a request context', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: { title: 'No context' },
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].payload).toEqual({ title: 'No context' });
    });

    it('should stamp the active traceparent onto every event', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'issue.created',
          channel: DeliveryChannel.INTERNAL,
          payload: {},
        },
      ];

      const span = trace.getTracer('test').startSpan('http');
      await context.with(trace.setSpan(context.active(), span), () =>
        service.createOutboxEvents(txClient, events),
      );
      span.end();

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].traceparent).toMatch(/^00-/);
    });

    it('should pass traceparent null when no span is active', async () => {
      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'issue.created',
          channel: DeliveryChannel.INTERNAL,
          payload: {},
        },
      ];

      await service.createOutboxEvents(txClient, events);

      const callArgs = tx.outboxEvent.createMany.mock.calls[0][0];
      expect(callArgs.data[0].traceparent).toBeNull();
    });

    it('should propagate errors from the transaction client', async () => {
      tx.outboxEvent.createMany.mockRejectedValue(new Error('DB error'));

      const events: OutboxEventInput[] = [
        {
          aggregateType: 'Issue',
          aggregateId: 'issue-1',
          eventType: 'ISSUE_CREATED',
          channel: DeliveryChannel.EMAIL,
          payload: {},
        },
      ];

      await expect(service.createOutboxEvents(txClient, events)).rejects.toThrow('DB error');
    });
  });
});
