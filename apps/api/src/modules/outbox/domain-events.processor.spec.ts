import { Test, TestingModule } from '@nestjs/testing';
import { OutboxStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { DomainEventsProcessor } from './domain-events.processor';
import { OutboxPollerProcessor } from './outbox-poller.processor';

describe('DomainEventsProcessor', () => {
  let processor: DomainEventsProcessor;
  let eventEmitter: { emitAsync: jest.Mock };
  let outboxPoller: {
    markProcessed: jest.Mock;
    markFailed: jest.Mock;
    findEventById: jest.Mock;
  };
  let tracerProvider: BasicTracerProvider;
  let contextManager: AsyncHooksContextManager;

  const buildJob = (name: string, data: Record<string, unknown>) =>
    ({ name, data }) as unknown as Job<{ outboxEventId: string }>;

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
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    outboxPoller = {
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      findEventById: jest
        .fn()
        .mockResolvedValue({
          attempts: 1,
          maxAttempts: 5,
          status: OutboxStatus.PROCESSING,
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventsProcessor,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: OutboxPollerProcessor, useValue: outboxPoller },
      ],
    }).compile();

    processor = module.get(DomainEventsProcessor);
  });

  it('re-emits the payload under the job name and marks the row processed', async () => {
    await processor.process(
      buildJob('issue.updated', {
        outboxEventId: 'evt-1',
        issueId: 'issue-1',
        requestId: 'req-1',
      }),
    );

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('issue.updated', {
      issueId: 'issue-1',
      requestId: 'req-1',
      eventId: 'evt-1',
    });
    expect(outboxPoller.markProcessed).toHaveBeenCalledWith('evt-1');
  });

  it('marks the row failed and re-throws when a listener fails', async () => {
    eventEmitter.emitAsync.mockRejectedValue(new Error('listener boom'));

    await expect(
      processor.process(
        buildJob('issue.created', { outboxEventId: 'evt-2' }),
      ),
    ).rejects.toThrow('listener boom');

    expect(outboxPoller.markFailed).toHaveBeenCalledWith(
      'evt-2',
      1,
      5,
      'listener boom',
    );
    expect(outboxPoller.markProcessed).not.toHaveBeenCalled();
  });

  it('skips redelivered jobs whose outbox row is already processed', async () => {
    outboxPoller.findEventById.mockResolvedValue({
      attempts: 1,
      maxAttempts: 5,
      status: OutboxStatus.PROCESSED,
    });

    await processor.process(buildJob('issue.updated', { outboxEventId: 'evt-3' }));

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(outboxPoller.markProcessed).not.toHaveBeenCalled();
  });

  it('skips jobs whose outbox row no longer exists', async () => {
    outboxPoller.findEventById.mockResolvedValue(null);

    await processor.process(buildJob('issue.updated', { outboxEventId: 'evt-4' }));

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('runs listeners under a span parented to the carried traceparent', async () => {
    const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const expectedTraceId = tp.split('-')[1];
    let observedTraceId: string | undefined;

    eventEmitter.emitAsync.mockImplementation(() => {
      observedTraceId = trace.getActiveSpan()?.spanContext().traceId;
      return Promise.resolve([]);
    });

    await processor.process(
      buildJob('issue.created', {
        outboxEventId: 'evt-1',
        __traceparent: tp,
        foo: 'bar',
      }),
    );

    expect(observedTraceId).toBe(expectedTraceId);
  });

  it('does not leak __traceparent into the listener payload', async () => {
    await processor.process(
      buildJob('issue.created', {
        outboxEventId: 'evt-1',
        __traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        foo: 'bar',
      }),
    );

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'issue.created',
      expect.not.objectContaining({ __traceparent: expect.anything() }),
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'issue.created',
      expect.objectContaining({ foo: 'bar', eventId: 'evt-1' }),
    );
  });
});
