import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { captureTraceparent, runWithTraceparent } from './trace-context';

describe('trace-context helpers', () => {
  let provider: BasicTracerProvider;
  let contextManager: AsyncHooksContextManager;

  beforeAll(() => {
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    trace.setGlobalTracerProvider(provider);
    // NodeSDK registers the propagator and context manager automatically in
    // production; the bare provider used here does not, so inject/extract and
    // context.with() would be no-ops without them.
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(async () => {
    contextManager.disable();
    await provider.shutdown();
  });

  it('captureTraceparent returns a W3C string when a span is active', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('parent');
    const captured = context.with(trace.setSpan(context.active(), span), () =>
      captureTraceparent(),
    );
    span.end();

    expect(captured).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it('captureTraceparent returns null when no span is active', () => {
    expect(captureTraceparent()).toBeNull();
  });

  it('runWithTraceparent makes the carried context the parent of new spans', () => {
    const tracer = trace.getTracer('test');
    const root = tracer.startSpan('root');
    const traceparent = context.with(
      trace.setSpan(context.active(), root),
      () => captureTraceparent(),
    )!;
    root.end();

    const expectedTraceId = traceparent.split('-')[1];

    const childTraceId = runWithTraceparent(traceparent, () => {
      const child = tracer.startSpan('child');
      const id = child.spanContext().traceId;
      child.end();
      return id;
    });

    expect(childTraceId).toBe(expectedTraceId);
  });

  it('runWithTraceparent with null runs the fn under a fresh context', () => {
    const result = runWithTraceparent(null, () => 'ran');
    expect(result).toBe('ran');
  });
});
